import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ListToolsRequestSchema,
    McpError,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import logger from '../utils/logger.js';
import { setupAccountResources } from '../resources/account-resources.js';
import { setupCategoryResources } from '../resources/category-resources.js';
import { setupTagResources } from '../resources/tag-resources.js';
import { setupBudgetResources } from '../resources/budget-resources.js';
import { setupUserResources } from '../resources/user-resources.js';
import { setupEntryResources } from '../resources/entry-resources.js';
import { setupAccountTools } from '../tools/account-tools.js';
import { setupCategoryTools } from '../tools/category-tools.js';
import { setupTagTools } from '../tools/tag-tools.js';
import { setupBudgetTools } from '../tools/budget-tools.js';
import { setupUserTools } from '../tools/user-tools.js';
import { setupAnalysisTools } from '../tools/analysis-tools.js';
import { setupEntryTools } from '../tools/entry-tools.js';

/**
 * Builds a Toshl MCP server with every resource and tool handler registered,
 * not yet connected to a transport.
 *
 * stdio connects exactly one. Streamable HTTP connects one per session, because
 * an SDK `Server` serves a single transport.
 * @returns A configured, unconnected MCP server
 */
export function createMcpServer(): Server {
    const name = process.env.MCP_SERVER_NAME || 'toshl-mcp-server';
    const version = process.env.MCP_SERVER_VERSION || '0.1.0';

    const server = new Server(
        {
            name,
            version,
        },
        {
            capabilities: {
                resources: {},
                tools: {},
            },
        }
    );

    // Set up error handling
    server.onerror = (error) => {
        logger.error('MCP server error', { error });
    };

    // Set up request handlers
    setupResourceHandlers(server);
    setupToolHandlers(server);

    logger.debug('Toshl MCP server created', { name, version });

    return server;
}

/**
 * Sets up the resource handlers for the MCP server
 * @param server MCP server to register the handlers on
 */
function setupResourceHandlers(server: Server) {
    // Set up resource listing
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        logger.debug('Handling ListResources request');
        return {
            resources: [
                // Account resources
                {
                    uri: 'toshl://accounts/list',
                    name: 'List of Toshl accounts',
                    mimeType: 'application/json',
                    description: 'List of all accounts in Toshl Finance',
                },
                // Category resources
                {
                    uri: 'toshl://categories/list',
                    name: 'List of Toshl categories',
                    mimeType: 'application/json',
                    description: 'List of all categories in Toshl Finance',
                },
                // Tag resources
                {
                    uri: 'toshl://tags/list',
                    name: 'List of Toshl tags',
                    mimeType: 'application/json',
                    description: 'List of all tags in Toshl Finance',
                },
                // Budget resources
                {
                    uri: 'toshl://budgets/list',
                    name: 'List of Toshl budgets',
                    mimeType: 'application/json',
                    description: 'List of all budgets in Toshl Finance',
                },
                // User resources
                {
                    uri: 'toshl://me',
                    name: 'Toshl user profile',
                    mimeType: 'application/json',
                    description: 'User profile information from Toshl Finance',
                },
                {
                    uri: 'toshl://me/summary',
                    name: 'Toshl account summary',
                    mimeType: 'application/json',
                    description: 'Summary of Toshl Finance accounts',
                },
                // Entry resources
                {
                    uri: 'toshl://entries/list',
                    name: 'List of Toshl entries',
                    mimeType: 'application/json',
                    description: 'List of entries in Toshl Finance',
                },
                {
                    uri: 'toshl://entries/sums',
                    name: 'Daily sums of Toshl entries',
                    mimeType: 'application/json',
                    description: 'Daily sums of entries in Toshl Finance',
                },
                {
                    uri: 'toshl://entries/timeline',
                    name: 'Timeline of Toshl entries',
                    mimeType: 'application/json',
                    description: 'Timeline of entries in Toshl Finance',
                },
            ],
        };
    });

    // Set up resource templates
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
        logger.debug('Handling ListResourceTemplates request');
        return {
            resourceTemplates: [
                // Account resource templates
                {
                    uriTemplate: 'toshl://accounts/{id}',
                    name: 'Toshl account details',
                    mimeType: 'application/json',
                    description: 'Details of a specific account in Toshl Finance',
                },
                // Category resource templates
                {
                    uriTemplate: 'toshl://categories/{id}',
                    name: 'Toshl category details',
                    mimeType: 'application/json',
                    description: 'Details of a specific category in Toshl Finance',
                },
                // Tag resource templates
                {
                    uriTemplate: 'toshl://tags/{id}',
                    name: 'Toshl tag details',
                    mimeType: 'application/json',
                    description: 'Details of a specific tag in Toshl Finance',
                },
                // Budget resource templates
                {
                    uriTemplate: 'toshl://budgets/{id}',
                    name: 'Toshl budget details',
                    mimeType: 'application/json',
                    description: 'Details of a specific budget in Toshl Finance',
                },
                {
                    uriTemplate: 'toshl://budgets/{id}/history',
                    name: 'Toshl budget history',
                    mimeType: 'application/json',
                    description: 'History of a specific budget in Toshl Finance',
                },
                // Entry resource templates
                {
                    uriTemplate: 'toshl://entries/{id}',
                    name: 'Toshl entry details',
                    mimeType: 'application/json',
                    description: 'Details of a specific entry in Toshl Finance',
                },
            ],
        };
    });

    // Set up resource reading
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const uri = request.params.uri;
        logger.debug('Handling ReadResource request', { uri });

        // Account resources
        if (uri.startsWith('toshl://accounts')) {
            return setupAccountResources(server, uri);
        }

        // Category resources
        if (uri.startsWith('toshl://categories')) {
            return setupCategoryResources(server, uri);
        }

        // Tag resources
        if (uri.startsWith('toshl://tags')) {
            return setupTagResources(server, uri);
        }

        // Budget resources
        if (uri.startsWith('toshl://budgets')) {
            return setupBudgetResources(server, uri);
        }

        // User resources
        if (uri.startsWith('toshl://me')) {
            return setupUserResources(server, uri);
        }

        // Entry resources
        if (uri.startsWith('toshl://entries')) {
            return setupEntryResources(server, uri);
        }

        throw new McpError(
            ErrorCode.MethodNotFound,
            `Resource not found: ${uri}`
        );
    });
}

/**
 * Sets up the tool handlers for the MCP server
 * @param server MCP server to register the handlers on
 */
function setupToolHandlers(server: Server) {
    // Set up tool listing
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        logger.debug('Handling ListTools request');

        const accountTools = setupAccountTools();
        const categoryTools = setupCategoryTools();
        const tagTools = setupTagTools();
        const budgetTools = setupBudgetTools();
        const userTools = setupUserTools();
        const entryTools = setupEntryTools();
        const analysisTools = setupAnalysisTools();

        return {
            tools: [
                ...accountTools,
                ...categoryTools,
                ...tagTools,
                ...budgetTools,
                ...userTools,
                ...entryTools,
                ...analysisTools,
            ],
        };
    });

    // Set up tool calling
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const toolName = request.params.name;
        const args = request.params.arguments;

        logger.debug('Handling CallTool request', { toolName, args });

        // Account tools
        if (toolName.startsWith('account_')) {
            return dispatchAccountTool(toolName, args);
        }

        // Category tools
        if (toolName.startsWith('category_')) {
            return dispatchCategoryTool(toolName, args);
        }

        // Tag tools
        if (toolName.startsWith('tag_')) {
            return dispatchTagTool(toolName, args);
        }

        // Budget tools
        if (toolName.startsWith('budget_')) {
            return dispatchBudgetTool(toolName, args);
        }

        // User tools
        if (toolName.startsWith('user_')) {
            return dispatchUserTool(toolName, args);
        }

        // Analysis tools
        if (toolName.startsWith('analyze_')) {
            return dispatchAnalysisTool(toolName, args);
        }

        // Entry tools
        if (toolName.startsWith('entry_')) {
            return dispatchEntryTool(toolName, args);
        }

        throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool not found: ${toolName}`
        );
    });
}

/**
 * Handles account tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
async function dispatchAccountTool(toolName: string, args: any) {
    // Import dynamically to avoid circular dependencies
    const { handleAccountTool } = await import('../tools/account-tools.js');
    return handleAccountTool(toolName, args);
}

/**
 * Handles category tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
async function dispatchCategoryTool(toolName: string, args: any) {
    // Import dynamically to avoid circular dependencies
    const { handleCategoryTool } = await import('../tools/category-tools.js');
    return handleCategoryTool(toolName, args);
}

/**
 * Handles tag tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
async function dispatchTagTool(toolName: string, args: any) {
    // Import dynamically to avoid circular dependencies
    const { handleTagTool } = await import('../tools/tag-tools.js');
    return handleTagTool(toolName, args);
}

/**
 * Handles budget tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
async function dispatchBudgetTool(toolName: string, args: any) {
    // Import dynamically to avoid circular dependencies
    const { handleBudgetTool } = await import('../tools/budget-tools.js');
    return handleBudgetTool(toolName, args);
}

/**
 * Handles user tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
async function dispatchUserTool(toolName: string, args: any) {
    // Import dynamically to avoid circular dependencies
    const { handleUserTool } = await import('../tools/user-tools.js');
    return handleUserTool(toolName, args);
}

/**
 * Handles analysis tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
async function dispatchAnalysisTool(toolName: string, args: any) {
    // Import dynamically to avoid circular dependencies
    const { handleAnalysisTool } = await import('../tools/analysis-tools.js');
    return handleAnalysisTool(toolName, args);
}

/**
 * Handles entry tools
 * @param toolName Tool name
 * @param args Tool arguments
 * @returns Tool response
 */
async function dispatchEntryTool(toolName: string, args: any) {
    // Import dynamically to avoid circular dependencies
    const { handleEntryTool } = await import('../tools/entry-tools.js');
    return handleEntryTool(toolName, args);
}

/**
 * Main MCP server for Toshl Finance API, served over stdio
 */
export class ToshlMcpServer {
    private server: Server = createMcpServer();
    private transport: StdioServerTransport | null = null;

    /**
     * Starts the MCP server
     */
    async start() {
        logger.info('Starting Toshl MCP server');

        this.transport = new StdioServerTransport();
        await this.server.connect(this.transport);

        logger.info('Toshl MCP server started');
    }

    /**
     * Stops the MCP server
     */
    async stop() {
        logger.info('Stopping Toshl MCP server');

        if (this.transport) {
            await this.server.close();
            this.transport = null;
        }

        logger.info('Toshl MCP server stopped');
    }
}
