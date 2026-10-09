import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createTagsClient } from '../api/endpoints/tags.js';
import { describeListedEntries, evaluateDelete, readEntryCount } from './delete-guard.js';
import { listGuardEntries } from './delete-guard-listing.js';
import { ToshlTag } from '../utils/types.js';
import logger from '../utils/logger.js';

/** Default page size for tag_list */
const TAG_LIST_DEFAULT_PER_PAGE = 200;

/** Toshl's documented per_page bounds for GET /tags (docs/api/tags-list.md) */
const TAG_LIST_MIN_PER_PAGE = 10;
const TAG_LIST_MAX_PER_PAGE = 500;

/** tag_list arguments that are forwarded to Toshl as query parameters */
const TAG_LIST_FILTERS = ['search', 'type', 'categories', 'ids', 'include_deleted'] as const;

/** Where to look when Toshl reports a conflict on a tag name */
const TAG_NAME_LOOKUP_HINT = 'tag_list with search set to the name finds it';

/**
 * Sets up tag tools
 * @returns List of tag tools
 */
export function setupTagTools() {
    return [
        {
            name: 'tag_list',
            description: 'List tags in Toshl Finance. Results are paginated: the response carries tags plus page, per_page, count and next_page; next_page is null on the last page. Tags can be filtered by name search, type, category or id, and deleted tags are included only when asked. compact returns only id, name, type, category, meta tag, deleted flag and Toshl\'s entry count, which does not include planned future entries.',
            inputSchema: {
                type: 'object',
                properties: {
                    page: {
                        type: 'integer',
                        description: 'Zero-based page number',
                        minimum: 0,
                        default: 0,
                    },
                    per_page: {
                        type: 'integer',
                        description: 'Number of tags per page',
                        minimum: TAG_LIST_MIN_PER_PAGE,
                        maximum: TAG_LIST_MAX_PER_PAGE,
                        default: TAG_LIST_DEFAULT_PER_PAGE,
                    },
                    search: {
                        type: 'string',
                        description: 'Search tags by name',
                    },
                    type: {
                        type: 'string',
                        description: 'Only tags of this type',
                        enum: ['expense', 'income'],
                    },
                    categories: {
                        type: 'string',
                        description: 'Comma-separated category IDs; only tags in these categories',
                    },
                    ids: {
                        type: 'string',
                        description: 'Comma-separated tag IDs',
                    },
                    include_deleted: {
                        type: 'boolean',
                        description: 'Also return deleted tags',
                        default: false,
                    },
                    compact: {
                        type: 'boolean',
                        description: 'Return only id, name, type, category, meta_tag, deleted and entries (Toshl\'s entry count) for each tag',
                        default: false,
                    },
                },
                required: [],
            },
        },
        {
            name: 'tag_get',
            description: 'Get details of a specific tag in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Tag ID',
                    },
                },
                required: ['id'],
            },
        },
        {
            name: 'tag_create',
            description: 'Create a new tag in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Tag name',
                    },
                    type: {
                        type: 'string',
                        description: 'Tag type',
                        enum: ['expense', 'income'],
                    },
                    category: {
                        type: 'string',
                        description: 'Optional category ID to associate the tag with',
                    },
                },
                required: ['name', 'type'],
            },
        },
        {
            name: 'tag_update',
            description: 'Update an existing tag in Toshl Finance (e.g. rename it, change its type, or associate it with a category)',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Tag ID',
                    },
                    name: {
                        type: 'string',
                        description: 'New tag name',
                    },
                    type: {
                        type: 'string',
                        description: 'Tag type',
                        enum: ['expense', 'income'],
                    },
                    category: {
                        type: 'string',
                        description: 'Category ID to associate the tag with',
                    },
                },
                required: ['id'],
            },
        },
        {
            name: 'tag_delete',
            description: 'Permanently delete a tag in Toshl Finance. Toshl also updates related data asynchronously; what happens to entries carrying the tag is not documented, so treat this as potentially destructive to those entries. Refuses to delete a tag that is used on entries, or whose entry count cannot be determined, unless force is set. Entries are checked both through the entry count Toshl reports and by listing entries that carry the tag, since the count omits planned future entries. That check is not atomic: an entry tagged between the check and the deletion is not protected by it.',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Tag ID',
                    },
                    force: {
                        type: 'boolean',
                        description: 'Delete even when the tag is still used on entries, or when its entry count could not be read.',
                        default: false,
                    },
                },
                required: ['id'],
            },
        },
    ];
}

/**
 * Reduces a tag to the fields tag_list's compact mode returns, leaving out any the
 * tag does not carry.
 * @param tag Tag from the API
 * @returns Compact tag
 */
const toCompactTag = (tag: ToshlTag): Record<string, unknown> => {
    const compact: Record<string, unknown> = {};
    for (const key of ['id', 'name', 'type', 'category', 'meta_tag', 'deleted']) {
        if (tag[key] !== undefined) {
            compact[key] = tag[key];
        }
    }

    const entries = readEntryCount(tag);
    if (entries !== undefined) {
        compact.entries = entries;
    }

    return compact;
};

/**
 * Whether an error is Toshl's 409 Conflict, as mapped by the error handler
 * @param error Caught error
 * @returns True for a conflict
 */
const isConflict = (error: unknown): boolean =>
    error instanceof McpError && (error.data as { status?: number } | undefined)?.status === 409;

/**
 * Handles the tag_list tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleTagListTool(args: any) {
    logger.debug('Handling tag_list tool', { args });

    const input = args ?? {};
    const page = input.page ?? 0;
    const perPage = input.per_page ?? TAG_LIST_DEFAULT_PER_PAGE;
    if (!Number.isInteger(page) || page < 0) {
        return {
            content: [{ type: 'text', text: 'Invalid parameter: page must be an integer >= 0' }],
            isError: true,
        };
    }
    if (!Number.isInteger(perPage) || perPage < TAG_LIST_MIN_PER_PAGE || perPage > TAG_LIST_MAX_PER_PAGE) {
        return {
            content: [{
                type: 'text',
                text: `Invalid parameter: per_page must be an integer between ${TAG_LIST_MIN_PER_PAGE} and ${TAG_LIST_MAX_PER_PAGE}`,
            }],
            isError: true,
        };
    }

    // Only allow-listed filters reach Toshl; compact and anything unknown stay here
    const params: Record<string, unknown> = { page, per_page: perPage };
    for (const key of TAG_LIST_FILTERS) {
        if (input[key] !== undefined) {
            params[key] = input[key];
        }
    }

    try {
        const tagsClient = await createTagsClient();
        const { tags, nextPage } = await tagsClient.listTagsPage(params);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        tags: input.compact ? tags.map(toCompactTag) : tags,
                        page,
                        per_page: perPage,
                        count: tags.length,
                        next_page: nextPage,
                    }, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling tag_list tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error listing tags: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the tag_get tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleTagGetTool(args: { id: string }) {
    logger.debug('Handling tag_get tool', { args });

    if (!args.id) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameter: id',
                },
            ],
            isError: true,
        };
    }

    try {
        const tagsClient = await createTagsClient();
        const tag = await tagsClient.getTag(args.id);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(tag, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling tag_get tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error getting tag: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the tag_create tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleTagCreateTool(args: { name: string; type: string; category?: string }) {
    logger.debug('Handling tag_create tool', { args });

    if (!args.name || !args.type) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameters: name and type are required',
                },
            ],
            isError: true,
        };
    }

    if (args.type !== 'expense' && args.type !== 'income') {
        return {
            content: [
                {
                    type: 'text',
                    text: `Invalid parameter: type must be "expense" or "income", got "${args.type}"`,
                },
            ],
            isError: true,
        };
    }

    try {
        const tagsClient = await createTagsClient();
        const tag = await tagsClient.createTag({
            name: args.name,
            type: args.type,
            ...(args.category ? { category: args.category } : {}),
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(tag, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling tag_create tool', { args, error });

        const text = isConflict(error)
            ? `Toshl refused to create the tag because of a conflict: a tag with this name and type already exists. ${TAG_NAME_LOOKUP_HINT}. (${(error as Error).message})`
            : `Error creating tag: ${(error as Error).message}`;

        return {
            content: [
                {
                    type: 'text',
                    text,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the tag_update tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleTagUpdateTool(args: { id: string; name?: string; type?: string; category?: string }) {
    logger.debug('Handling tag_update tool', { args });

    if (!args.id) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameter: id',
                },
            ],
            isError: true,
        };
    }

    if (args.name === undefined && args.type === undefined && args.category === undefined) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing parameters: at least one of name, type or category must be provided',
                },
            ],
            isError: true,
        };
    }

    if (args.type !== undefined && args.type !== 'expense' && args.type !== 'income') {
        return {
            content: [
                {
                    type: 'text',
                    text: `Invalid parameter: type must be "expense" or "income", got "${args.type}"`,
                },
            ],
            isError: true,
        };
    }

    try {
        const tagsClient = await createTagsClient();
        const tag = await tagsClient.updateTag(args.id, {
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.type !== undefined ? { type: args.type } : {}),
            ...(args.category !== undefined ? { category: args.category } : {}),
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(tag, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling tag_update tool', { args, error });

        // Toshl documents 409 as "modified since the client last saw it", so a conflict
        // on a rename may be that rather than a duplicate name
        const text = isConflict(error) && args.name !== undefined
            ? `Toshl refused to update the tag because of a conflict: either a tag with the new name and type already exists (${TAG_NAME_LOOKUP_HINT}), or the tag was changed elsewhere during the update. (${(error as Error).message})`
            : `Error updating tag: ${(error as Error).message}`;

        return {
            content: [
                {
                    type: 'text',
                    text,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the tag_delete tool
 *
 * The entry-count guard is the whole safety story for this tool, so it fails closed:
 * a count that cannot be read is treated exactly like a non-zero one.
 *
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleTagDeleteTool(args: { id: string; force?: boolean }) {
    logger.debug('Handling tag_delete tool', { args });

    if (!args.id) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameter: id',
                },
            ],
            isError: true,
        };
    }

    try {
        const tagsClient = await createTagsClient();

        if (!args.force) {
            const tag = await tagsClient.getTag(args.id);
            const verdict = evaluateDelete(readEntryCount(tag), args.force);

            if (!verdict.allowed) {
                const text =
                    verdict.reason === 'unknown-count'
                        ? `Could not determine how many entries tag "${tag.name}" is used on, so the deletion was refused. Check the tag in Toshl, then re-run with force: true to delete it anyway.`
                        : `Tag "${tag.name}" is still used on ${verdict.entryCount} entries. Deletion refused to protect them. Re-run with force: true to delete it anyway.`;

                return {
                    content: [
                        {
                            type: 'text',
                            text,
                        },
                    ],
                    isError: true,
                };
            }

            // The count leaves out planned entries, so also look for entries carrying the tag
            const listed = await listGuardEntries({ tags: args.id });
            if (!listed.allowed) {
                const text =
                    listed.reason === 'unknown-entries'
                        ? `Could not list the entries tag "${tag.name}" is used on, so the deletion was refused. Check the tag in Toshl, then re-run with force: true to delete it anyway.`
                        : `Tag "${tag.name}" is used on at least ${listed.entries.length} entries, including planned entries that Toshl's count leaves out: ${describeListedEntries(listed.entries)}. Deletion refused. Re-run with force: true to delete it anyway.`;

                return {
                    content: [
                        {
                            type: 'text',
                            text,
                        },
                    ],
                    isError: true,
                };
            }
        }

        await tagsClient.deleteTag(args.id);

        return {
            content: [
                {
                    type: 'text',
                    text: `Tag ${args.id} deleted.`,
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling tag_delete tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error deleting tag: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles tag tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleTagTool(toolName: string, args: any) {
    switch (toolName) {
        case 'tag_list':
            return handleTagListTool(args);
        case 'tag_get':
            return handleTagGetTool(args as { id: string });
        case 'tag_create':
            return handleTagCreateTool(args as { name: string; type: string; category?: string });
        case 'tag_update':
            return handleTagUpdateTool(args as { id: string; name?: string; type?: string; category?: string });
        case 'tag_delete':
            return handleTagDeleteTool(args as { id: string; force?: boolean });
        default:
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Tool not found: ${toolName}`
            );
    }
}
