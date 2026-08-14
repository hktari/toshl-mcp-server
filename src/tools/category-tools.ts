import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createCategoriesClient } from '../api/endpoints/categories.js';
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
            name: 'category_delete',
            description: 'Delete a category in Toshl Finance. Deletion is blocked if the category still has entries unless force is set.',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Category ID',
                    },
                    force: {
                        type: 'boolean',
                        description: 'Delete even if the category still has entries. Warning: may orphan those entries.',
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
 * Handles the category_delete tool
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
        const category = await categoriesClient.getCategory(args.id);
        const entryCount = category.counts?.entries ?? 0;

        if (entryCount > 0 && !args.force) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Category "${category.name}" has ${entryCount} entries. Deletion blocked to avoid orphaning them. Re-run with force: true to delete anyway.`,
                    },
                ],
            };
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
        case 'category_delete':
            return handleCategoryDeleteTool(args as { id: string; force?: boolean });
        default:
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Tool not found: ${toolName}`
            );
    }
}
