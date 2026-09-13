import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createEntriesClient } from '../api/endpoints/entries.js';
import { createCategoriesClient } from '../api/endpoints/categories.js';
import { ToshlTransaction } from '../utils/types.js';
import logger from '../utils/logger.js';

// Toshl's documented page-size bounds for list endpoints
const ENTRY_LIST_DEFAULT_PER_PAGE = 200;
const ENTRY_LIST_MAX_PER_PAGE = 500;

/**
 * Sets up entry tools
 * @returns List of entry tools
 */
export function setupEntryTools() {
    return [
        {
            name: 'entry_convert_to_transfer',
            description: 'Convert a regular entry to a transfer between accounts in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'ID of the entry to convert',
                    },
                    destination_account: {
                        type: 'string',
                        description: 'Destination account ID for the transfer',
                    },
                    description: {
                        type: 'string',
                        description: 'Optional description for the transfer',
                    },
                },
                required: ['id', 'destination_account'],
            },
        },
        {
            name: 'entry_list',
            description: 'List entries in Toshl Finance. Results are paginated: the response carries '
                + '`entries` plus `page`, `per_page`, `count` and `next_page`. When `next_page` is not null, '
                + 'call again with `page` set to that value to fetch the remaining entries.',
            inputSchema: {
                type: 'object',
                properties: {
                    page: {
                        type: 'integer',
                        minimum: 0,
                        description: 'Zero-based page index (default 0). Use the `next_page` value from a previous response.',
                    },
                    per_page: {
                        type: 'integer',
                        minimum: 1,
                        maximum: ENTRY_LIST_MAX_PER_PAGE,
                        description: `Entries per page, 1-${ENTRY_LIST_MAX_PER_PAGE} (default ${ENTRY_LIST_DEFAULT_PER_PAGE}).`,
                    },
                    from: {
                        type: 'string',
                        description: 'Start date (YYYY-MM-DD)',
                    },
                    to: {
                        type: 'string',
                        description: 'End date (YYYY-MM-DD)',
                    },
                    type: {
                        type: 'string',
                        description: 'Entry type (expense, income, transaction)',
                    },
                    accounts: {
                        type: 'string',
                        description: 'A comma separated list of account ids. If used only entries from the specified accounts are returned.',
                    },
                    categories: {
                        type: 'string',
                        description: 'A comma separated list of category ids. If used only entries in the specified categories are returned.',
                    },
                    tags: {
                        type: 'string',
                        description: 'Comma-separated list of tag IDs',
                    },
                    search: {
                        type: 'string',
                        description: 'Search term',
                    },
                },
                required: ['from', 'to'],
            },
        },
        {
            name: 'entry_manage',
            description: 'Manage entries in bulk in Toshl Finance.',
            inputSchema: {
                type: 'object',
                properties: {
                    with: {
                        type: 'object',
                        description: 'Criteria to select entries to manage',
                        properties: {
                            tags: {
                                type: 'array',
                                description: 'Array of tag IDs to select entries with',
                                items: {
                                    type: 'string',
                                }
                            },
                            accounts: {
                                type: 'array',
                                description: 'Array of account IDs to select entries with',
                                items: {
                                    type: 'string',
                                }
                            },
                            categories: {
                                type: 'array',
                                description: 'Array of category IDs to select entries with',
                                items: {
                                    type: 'string',
                                }
                            },
                            description: {
                                type: 'string',
                                description: 'Description text to select entries with',
                            }
                        },
                    },
                    set: {
                        type: 'object',
                        description: 'Properties to set on selected entries',
                        properties: {
                            tags: {
                                type: 'array',
                                description: 'Array of tag IDs to set on entries',
                                items: {
                                    type: 'string',
                                }
                            },
                            account: {
                                type: 'string',
                                description: 'Account ID to set on entries',
                            },
                            category: {
                                type: 'string',
                                description: 'Category ID to set on entries',
                            }
                        },
                    },
                    add: {
                        type: 'object',
                        description: 'Properties to add to selected entries',
                        properties: {
                            tags: {
                                type: 'array',
                                description: 'Array of tag IDs to add to entries',
                                items: {
                                    type: 'string',
                                }
                            }
                        },
                    },
                    remove: {
                        type: 'object',
                        description: 'Properties to remove from selected entries',
                        properties: {
                            tags: {
                                type: 'array',
                                description: 'Array of tag IDs to remove from entries',
                                items: {
                                    type: 'string',
                                }
                            }
                        },
                    }
                },
                required: ['with'],
            },
        },
        {
            name: 'entry_get',
            description: 'Get details of a specific entry in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Entry ID',
                    },
                },
                required: ['id'],
            },
        },
        {
            name: 'entry_sums',
            description: 'Get daily sums of entries in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    from: {
                        type: 'string',
                        description: 'Start date (YYYY-MM-DD)',
                    },
                    to: {
                        type: 'string',
                        description: 'End date (YYYY-MM-DD)',
                    },
                    currency: {
                        type: 'string',
                        description: 'Currency code',
                    },
                    accounts: {
                        type: 'string',
                        description: 'Comma-separated list of account IDs',
                    },
                    categories: {
                        type: 'string',
                        description: 'Comma-separated list of category IDs',
                    },
                    tags: {
                        type: 'string',
                        description: 'Comma-separated list of tag IDs',
                    },
                    range: {
                        type: 'string',
                        description: 'Sum range (day, week, month)',
                    },
                    type: {
                        type: 'string',
                        description: 'Entry type (expense, income)',
                    },
                },
                required: ['from', 'to', 'currency'],
            },
        },
        {
            name: 'entry_timeline',
            description: 'Get timeline of entries in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    from: {
                        type: 'string',
                        description: 'Start date (YYYY-MM-DD)',
                    },
                    to: {
                        type: 'string',
                        description: 'End date (YYYY-MM-DD)',
                    },
                    accounts: {
                        type: 'string',
                        description: 'Comma-separated list of account IDs',
                    },
                    categories: {
                        type: 'string',
                        description: 'Comma-separated list of category IDs',
                    },
                    tags: {
                        type: 'string',
                        description: 'Comma-separated list of tag IDs',
                    },
                },
                required: ['from', 'to'],
            },
        },
        {
            name: 'entry_create',
            description: 'Create a new entry in Toshl Finance. To create a transfer between accounts, include a transaction object with the destination account ID and currency.',
            inputSchema: {
                type: 'object',
                properties: {
                    amount: {
                        type: 'number',
                        description: 'Entry amount (negative for expense, positive for income)',
                    },
                    currency: {
                        type: 'object',
                        description: 'Currency object',
                        properties: {
                            code: {
                                type: 'string',
                                description: 'Currency code (e.g., USD, EUR)',
                            },
                            rate: {
                                type: 'number',
                                description: 'Exchange rate',
                            },
                            fixed: {
                                type: 'boolean',
                                description: 'Whether the exchange rate is fixed',
                            },
                        },
                        required: ['code'],
                    },
                    date: {
                        type: 'string',
                        description: 'Entry date (YYYY-MM-DD)',
                    },
                    desc: {
                        type: 'string',
                        description: 'Entry description',
                    },
                    account: {
                        type: 'string',
                        description: 'Account ID',
                    },
                    category: {
                        type: 'string',
                        description: 'Category ID (use Transfer category ID for transfers)',
                    },
                    tags: {
                        type: 'array',
                        description: 'Array of tag IDs',
                        items: {
                            type: 'string',
                        },
                    },
                    transaction: {
                        type: 'object',
                        description: 'Transaction object for transfers between accounts',
                        properties: {
                            account: {
                                type: 'string',
                                description: 'Destination account ID for the transfer',
                            },
                            currency: {
                                type: 'object',
                                description: 'Currency object for the destination account',
                                properties: {
                                    code: {
                                        type: 'string',
                                        description: 'Currency code (e.g., USD, EUR)',
                                    },
                                },
                                required: ['code'],
                            },
                        },
                        required: ['account', 'currency'],
                    },
                },
                required: ['amount', 'currency', 'date', 'account', 'category'],
            },
        },
        {
            name: 'entry_update',
            description: 'Update an existing entry in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Entry ID',
                    },
                    amount: {
                        type: 'number',
                        description: 'Entry amount (negative for expense, positive for income)',
                    },
                    currency: {
                        type: 'object',
                        description: 'Currency object',
                        properties: {
                            code: {
                                type: 'string',
                                description: 'Currency code (e.g., USD, EUR)',
                            },
                            rate: {
                                type: 'number',
                                description: 'Exchange rate',
                            },
                            fixed: {
                                type: 'boolean',
                                description: 'Whether the exchange rate is fixed',
                            },
                        },
                        required: ['code'],
                    },
                    date: {
                        type: 'string',
                        description: 'Entry date (YYYY-MM-DD)',
                    },
                    desc: {
                        type: 'string',
                        description: 'Entry description',
                    },
                    account: {
                        type: 'string',
                        description: 'Account ID',
                    },
                    category: {
                        type: 'string',
                        description: 'Category ID',
                    },
                    tags: {
                        type: 'array',
                        description: 'Array of tag IDs',
                        items: {
                            type: 'string',
                        },
                    },
                    updateMode: {
                        type: 'string',
                        description: 'Update mode for repeating entries (all, one, tail)',
                        enum: ['all', 'one', 'tail'],
                    },
                },
                required: ['id'],
            },
        },
        {
            name: 'entry_delete',
            description: 'Delete an entry in Toshl Finance',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Entry ID',
                    },
                    deleteMode: {
                        type: 'string',
                        description: 'Delete mode for repeating entries (all, one, tail)',
                        enum: ['all', 'one', 'tail'],
                    },
                },
                required: ['id'],
            },
        },
    ];
}

/**
 * Handles the entry_list tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryListTool(args: any) {
    logger.debug('Handling entry_list tool', { args });

    if (!args.from || !args.to) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameters: from and to dates',
                },
            ],
            isError: true,
        };
    }

    const page = args.page ?? 0;
    const perPage = args.per_page ?? ENTRY_LIST_DEFAULT_PER_PAGE;
    if (!Number.isInteger(page) || page < 0) {
        return {
            content: [{ type: 'text', text: 'Invalid parameter: page must be an integer >= 0' }],
            isError: true,
        };
    }
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > ENTRY_LIST_MAX_PER_PAGE) {
        return {
            content: [{
                type: 'text',
                text: `Invalid parameter: per_page must be an integer between 1 and ${ENTRY_LIST_MAX_PER_PAGE}`,
            }],
            isError: true,
        };
    }

    try {
        const entriesClient = await createEntriesClient();
        const { entries, nextPage } = await entriesClient.listEntriesPage({ ...args, page, per_page: perPage });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        entries,
                        page,
                        per_page: perPage,
                        count: entries.length,
                        next_page: nextPage,
                    }, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_list tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error listing entries: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the entry_get tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryGetTool(args: { id: string }) {
    logger.debug('Handling entry_get tool', { args });

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
        const entriesClient = await createEntriesClient();
        const entry = await entriesClient.getEntry(args.id);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(entry, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_get tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error getting entry: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the entry_sums tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntrySumsTool(args: any) {
    logger.debug('Handling entry_sums tool', { args });

    if (!args.from || !args.to || !args.currency) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameters: from, to, and currency',
                },
            ],
            isError: true,
        };
    }

    try {
        const entriesClient = await createEntriesClient();
        const sums = await entriesClient.getEntrySums(args);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(sums, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_sums tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error getting entry sums: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the entry_timeline tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryTimelineTool(args: any) {
    logger.debug('Handling entry_timeline tool', { args });

    if (!args.from || !args.to) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameters: from and to dates',
                },
            ],
            isError: true,
        };
    }

    try {
        const entriesClient = await createEntriesClient();
        const timeline = await entriesClient.getEntryTimeline(args);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(timeline, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_timeline tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error getting entry timeline: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the entry_create tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryCreateTool(args: any) {
    logger.debug('Handling entry_create tool', { args });

    // Check required parameters
    if (!args.amount || !args.currency || !args.date || !args.account || !args.category) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameters: amount, currency, date, account, and category are required',
                },
            ],
            isError: true,
        };
    }

    // Check currency code
    if (!args.currency.code) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameter: currency.code',
                },
            ],
            isError: true,
        };
    }

    try {
        const entriesClient = await createEntriesClient();
        const entry = await entriesClient.createEntry(args);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(entry, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_create tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error creating entry: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the entry_update tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryUpdateTool(args: any) {
    logger.debug('Handling entry_update tool', { args });

    // Check required parameters
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
        const entriesClient = await createEntriesClient();

        // Extract id and updateMode from args
        const { id, updateMode, ...entryData } = args;

        // Update the entry
        const entry = await entriesClient.updateEntry(id, entryData, updateMode);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(entry, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_update tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error updating entry: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the entry_delete tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryDeleteTool(args: any) {
    logger.debug('Handling entry_delete tool', { args });

    // Check required parameters
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
        const entriesClient = await createEntriesClient();

        // Delete the entry
        await entriesClient.deleteEntry(args.id, args.deleteMode);

        return {
            content: [
                {
                    type: 'text',
                    text: `Entry ${args.id} deleted successfully`,
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_delete tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error deleting entry: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the entry_manage tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryManageTool(args: any) {
    logger.debug('Handling entry_manage tool', { args });

    // Check required parameters
    if (!args.with) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameter: with',
                },
            ],
            isError: true,
        };
    }

    // Check that at least one with parameter is provided
    if (!args.with.tags && !args.with.accounts && !args.with.categories && !args.with.description) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'At least one with parameter is required (tags, accounts, categories, or description)',
                },
            ],
            isError: true,
        };
    }

    // Check that at least one action parameter is provided
    if (!args.set && !args.add && !args.remove) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'At least one action parameter is required (set, add, or remove)',
                },
            ],
            isError: true,
        };
    }

    try {
        const entriesClient = await createEntriesClient();

        // Manage the entries
        await entriesClient.manageEntries(args);

        return {
            content: [
                {
                    type: 'text',
                    text: 'Entries managed successfully',
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_manage tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error managing entries: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles the entry_convert_to_transfer tool
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryConvertToTransferTool(args: { id: string; destination_account: string; description?: string }) {
    logger.debug('Handling entry_convert_to_transfer tool', { args });

    // Check required parameters
    if (!args.id || !args.destination_account) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Missing required parameters: id and destination_account are required',
                },
            ],
            isError: true,
        };
    }

    try {
        const entriesClient = await createEntriesClient();
        const categoriesClient = await createCategoriesClient();

        // Toshl files transfers under a per-account system category; resolve it before
        // touching any entry so a missing one costs nothing.
        const transferCategoryId = await categoriesClient.findTransferCategoryId();
        if (!transferCategoryId) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'No system "Transfer" category found on this Toshl account, so the entry was left unchanged.',
                    },
                ],
                isError: true,
            };
        }

        // Get the original entry
        const originalEntry = await entriesClient.getEntry(args.id);

        // Create a new transfer entry
        const transferEntry = {
            amount: originalEntry.amount,
            currency: originalEntry.currency,
            date: originalEntry.date,
            desc: args.description || `Transfer to ${args.destination_account}`,
            account: originalEntry.account,
            category: transferCategoryId,
            tags: originalEntry.tags,
            transaction: {
                account: args.destination_account,
                currency: originalEntry.currency,
            } as any,
        };

        // Create the transfer entry
        const newEntry = await entriesClient.createEntry(transferEntry);

        // Delete the original entry. The two writes are not atomic, so if this one fails
        // undo the first rather than leave the user with a duplicate.
        try {
            await entriesClient.deleteEntry(args.id);
        } catch (deleteError) {
            logger.error('Original entry could not be deleted after creating the transfer; rolling back', {
                id: args.id,
                newEntryId: newEntry.id,
                error: deleteError,
            });
            try {
                await entriesClient.deleteEntry(newEntry.id);
            } catch (rollbackError) {
                logger.error('Rollback of the new transfer entry failed', { newEntryId: newEntry.id, error: rollbackError });
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Conversion failed part-way: transfer entry ${newEntry.id} was created but the original `
                                + `entry ${args.id} could not be deleted, and removing the new transfer also failed. `
                                + `Both entries now exist; delete one of them manually.`,
                        },
                    ],
                    isError: true,
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Conversion aborted: the original entry ${args.id} was kept and the new transfer `
                            + `was removed again, because deleting the original failed: ${(deleteError as Error).message}`,
                    },
                ],
                isError: true,
            };
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(newEntry, null, 2),
                },
            ],
        };
    } catch (error) {
        logger.error('Error handling entry_convert_to_transfer tool', { args, error });

        return {
            content: [
                {
                    type: 'text',
                    text: `Error converting entry to transfer: ${(error as Error).message}`,
                },
            ],
            isError: true,
        };
    }
}

/**
 * Handles entry tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
export async function handleEntryTool(toolName: string, args: any) {
    switch (toolName) {
        case 'entry_convert_to_transfer':
            return handleEntryConvertToTransferTool(args as { id: string; destination_account: string; description?: string });
        case 'entry_list':
            return handleEntryListTool(args);
        case 'entry_get':
            return handleEntryGetTool(args as { id: string });
        case 'entry_sums':
            return handleEntrySumsTool(args);
        case 'entry_timeline':
            return handleEntryTimelineTool(args);
        case 'entry_create':
            return handleEntryCreateTool(args);
        case 'entry_update':
            return handleEntryUpdateTool(args);
        case 'entry_delete':
            return handleEntryDeleteTool(args);
        case 'entry_manage':
            return handleEntryManageTool(args);
        default:
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Tool not found: ${toolName}`
            );
    }
}
