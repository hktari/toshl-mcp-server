import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createCategoriesClient } from '../api/endpoints/categories.js';
import { evaluateDelete, readEntryCount } from './delete-guard.js';
import logger from '../utils/logger.js';

/**
 * Sets up category tools
 * @returns List of category tools
 */
export function setupCategoryTools() {
    return [
        {
            name: 'category_list',
            description: 'List all categories in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
        {
            name: 'category_get',
            description: 'Get details of a specific category in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Category ID',
                    },
                },
                required: ['id'],
            },
        },
        {
            name: 'category_create',
            description: 'Create a new category in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Category name',
                    },
                    type: {
                        type: 'string',
                        description: 'Category type',
                        enum: ['expense', 'income'],
                    },
                },
                required: ['name', 'type'],
            },
        },
        {
            name: 'category_update',
            description: 'Update an existing category in Toshl Finance (e.g. rename it or change its type)',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Category ID',
                    },
                    name: {
                        type: 'string',
                        description: 'New category name',
                    },
                    type: {
                        type: 'string',
                        description: 'Category type',
                        enum: ['expense', 'income'],
                    },
                },
                required: ['id'],
            },
        },
        {
            name: 'category_delete',
            description: 'Permanently delete a category in Toshl Finance. Toshl also updates related data asynchronously; what happens to entries filed under the category is not documented, so treat this as potentially destructive to those entries. Refuses to delete a category that has entries, or whose entry count cannot be determined, unless force is set.',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Category ID',
                    },
                    force: {
                        type: 'boolean',
                        description: 'Delete even when the category still has entries, or when its entry count could not be read.',
                        default: false,
                    },
                },
                required: ['id'],
            },
        },
    ];
}

/**
 * Handles the category_list tool
 * @returns Tool response
 */
export async function handleCategoryListTool() {
    logger.debug('Handling category_list tool');

    try {
        const categoriesClient = await createCategoriesClient();
        const categories = await categoriesClient.listCategories();

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(categories, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling category_list tool', { error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error listing categories: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the category_get tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleCategoryGetTool(args: { id: string }) {
    logger.debug('Handling category_get tool', { args });

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
        const categoriesClient = await createCategoriesClient();
        const category = await categoriesClient.getCategory(args.id);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(category, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling category_get tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error getting category: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the category_create tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleCategoryCreateTool(args: { name: string; type: string }) {
    logger.debug('Handling category_create tool', { args });

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
        const categoriesClient = await createCategoriesClient();
        const category = await categoriesClient.createCategory({
            name: args.name,
            type: args.type,
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(category, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling category_create tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error creating category: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the category_update tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleCategoryUpdateTool(args: { id: string; name?: string; type?: string }) {
    logger.debug('Handling category_update tool', { args });

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

    if (args.name === undefined && args.type === undefined) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing parameters: at least one of name or type must be provided',
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
        const categoriesClient = await createCategoriesClient();
        const category = await categoriesClient.updateCategory(args.id, {
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.type !== undefined ? { type: args.type } : {}),
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(category, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling category_update tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error updating category: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the category_delete tool
 *
 * The entry-count guard is the whole safety story for this tool, so it fails closed:
 * a count that cannot be read is treated exactly like a non-zero one. `counts` is
 * documented on the category schema but is not guaranteed on every response, and
 * reading a missing field as "0 entries" would silently turn the guard into a no-op
 * on precisely the categories it exists to protect.
 *
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleCategoryDeleteTool(args: { id: string; force?: boolean }) {
    logger.debug('Handling category_delete tool', { args });

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
        const categoriesClient = await createCategoriesClient();

        if (!args.force) {
            const category = await categoriesClient.getCategory(args.id);
            const verdict = evaluateDelete(readEntryCount(category), args.force);

            if (!verdict.allowed) {
                const text =
                    verdict.reason === 'unknown-count'
                        ? `Could not determine how many entries category "${category.name}" has, so the deletion was refused. Check the category in Toshl, then re-run with force: true to delete it anyway.`
                        : `Category "${category.name}" still has ${verdict.entryCount} entries. Deletion refused to protect them. Re-run with force: true to delete it anyway.`;

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

        await categoriesClient.deleteCategory(args.id);

        return {
            content: [
                {
                    type: 'text',
                    text: `Category ${args.id} deleted.`,
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling category_delete tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error deleting category: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles category tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleCategoryTool(toolName: string, args: any) {
    switch (toolName) {
        case 'category_list':
            return handleCategoryListTool();
        case 'category_get':
            return handleCategoryGetTool(args as { id: string });
        case 'category_create':
            return handleCategoryCreateTool(args as { name: string; type: string });
        case 'category_update':
            return handleCategoryUpdateTool(args as { id: string; name?: string; type?: string });
        case 'category_delete':
            return handleCategoryDeleteTool(args as { id: string; force?: boolean });
        default:
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Tool not found: ${toolName}`
            );
    }
}
