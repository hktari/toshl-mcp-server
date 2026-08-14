import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createTagsClient } from '../api/endpoints/tags.js';
import logger from '../utils/logger.js';

/**
 * Sets up tag tools
 * @returns List of tag tools
 */
export function setupTagTools() {
    return [
        {
            name: 'tag_list',
            description: 'List all tags in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {},
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
            name: 'tag_delete',
            description: 'Delete a tag in Toshl Finance. Deletion is blocked if the tag still has entries unless force is set.',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Tag ID',
                    },
                    force: {
                        type: 'boolean',
                        description: 'Delete even if the tag still has entries. Warning: may orphan those entries.',
                        default: false,
                    },
                },
                required: ['id'],
            },
        },
    ];
}

/**
 * Handles the tag_list tool
 * @returns Tool response
 */
export async function handleTagListTool() {
    logger.debug('Handling tag_list tool');

    try {
        const tagsClient = await createTagsClient();
        const tags = await tagsClient.listTags();

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(tags, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling tag_list tool', { error });

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

        return {
            content: [
                {
                    type: 'text',
                    text: `Error creating tag: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the tag_delete tool
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
        const tag = await tagsClient.getTag(args.id);
        const entryCount = tag.counts?.entries ?? 0;

        if (entryCount > 0 && !args.force) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Tag "${tag.name}" has ${entryCount} entries. Deletion blocked to avoid orphaning them. Re-run with force: true to delete anyway.`,
                    },
                ],
            };
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
            return handleTagListTool();
        case 'tag_get':
            return handleTagGetTool(args as { id: string });
        case 'tag_create':
            return handleTagCreateTool(args as { name: string; type: string; category?: string });
        case 'tag_delete':
            return handleTagDeleteTool(args as { id: string; force?: boolean });
        default:
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Tool not found: ${toolName}`
            );
    }
}
