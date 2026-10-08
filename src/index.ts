#!/usr/bin/env node
import dotenv from 'dotenv';
import { ToshlMcpServer } from './server/server.js';
import { startHttpServer } from './server/http.js';
import { loadTransportConfig } from './server/transport-config.js';
import { setupLogger } from './utils/logger.js';

// Load environment variables
dotenv.config();

// Setup logger
const logger = setupLogger();

// Start the server
async function main() {
    try {
        logger.info('Starting Toshl MCP Server...');

        const config = loadTransportConfig();

        let stop: () => Promise<void>;
        if (config.transport === 'http') {
            const httpServer = await startHttpServer(config.http);
            stop = () => httpServer.close();
        } else {
            const server = new ToshlMcpServer();
            await server.start();
            stop = () => server.stop();
        }

        logger.info('Toshl MCP Server started successfully', { transport: config.transport });

        // Handle graceful shutdown
        const shutdown = async () => {
            logger.info('Shutting down Toshl MCP Server...');
            await stop();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        logger.error('Failed to start Toshl MCP Server', { error });
        process.exit(1);
    }
}

main();
