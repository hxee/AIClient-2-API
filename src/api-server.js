/**
 * Minimal OpenAI Proxy Server
 *
 * A lightweight proxy that:
 * - Forwards OpenAI format requests directly to upstream
 * - Converts Claude format requests to OpenAI format then forwards
 * - Proxies model list from upstream
 *
 * Usage:
 * node src/api-server.js --openai-api-key sk-xxx --openai-base-url https://api.openai.com/v1
 *
 * Options:
 * --host <address>             Server listening address (default: localhost)
 * --port <number>              Server listening port (default: 3000)
 * --api-key <key>              Required API key for authentication (default: 123456)
 * --openai-api-key <key>       OpenAI API key for upstream
 * --openai-base-url <url>      OpenAI API base URL (default: https://api.openai.com/v1)
 * --system-prompt-file <path>  System prompt file path
 * --system-prompt-mode <mode>  System prompt mode: overwrite or append (default: append)
 * --log-prompts <mode>         Prompt logging: console, file, or none (default: none)
 */

import * as http from 'http';
import 'dotenv/config';
import './converters/register-converters.js'; // Register converters

import { initializeConfig, CONFIG } from './config-manager.js';
import { initApiService } from './service-manager.js';
import { createRequestHandler } from './request-handler.js';

// Start server
async function startServer() {
    // Initialize configuration
    await initializeConfig();

    // Initialize OpenAI service
    await initApiService(CONFIG);

    // Create request handler
    const requestHandlerInstance = createRequestHandler(CONFIG);

    // Create and start HTTP server
    const server = http.createServer(requestHandlerInstance);
    server.listen(CONFIG.SERVER_PORT, CONFIG.HOST, () => {
        console.log(`\n${'='.repeat(60)}`);
        console.log('  Minimal OpenAI Proxy Server');
        console.log(`${'='.repeat(60)}`);
        console.log(`  Host: ${CONFIG.HOST}`);
        console.log(`  Port: ${CONFIG.SERVER_PORT}`);
        console.log(`  API Key: ${CONFIG.REQUIRED_API_KEY}`);
        console.log(`  Upstream: ${CONFIG.OPENAI_BASE_URL}`);
        console.log(`  System Prompt: ${CONFIG.SYSTEM_PROMPT_FILE_PATH || 'None'}`);
        console.log(`  Prompt Logging: ${CONFIG.PROMPT_LOG_MODE}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`\nServer running on http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}`);
        console.log('\nSupported endpoints:');
        console.log('  GET  /v1/models           - List available models');
        console.log('  POST /v1/chat/completions - OpenAI chat (direct forward)');
        console.log('  POST /v1/messages         - Claude messages (convert & forward)');
        console.log('  GET  /health              - Health check');
        console.log('');
    });

    return server;
}

startServer().catch(err => {
    console.error("[Server] Failed to start:", err.message);
    process.exit(1);
});
