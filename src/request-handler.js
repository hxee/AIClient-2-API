/**
 * Request Handler - Minimal version
 * Handles incoming requests and routes them to appropriate handlers
 */

import { handleError, isAuthorized } from './common.js';
import { handleAPIRequests } from './api-manager.js';
import { getApiService } from './service-manager.js';
import { PROMPT_LOG_FILENAME } from './config-manager.js';

/**
 * Main request handler
 * Authenticates requests and routes to appropriate endpoint handlers
 */
export function createRequestHandler(config) {
    return async function requestHandler(req, res) {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);
        const path = requestUrl.pathname;
        const method = req.method;

        // Handle CORS preflight requests
        if (method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.writeHead(204);
            res.end();
            return;
        }

        // Log request
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[Request] ${new Date().toLocaleString()}`);
        console.log(`[Request] ${method} ${path}`);

        // Health check endpoint
        if (method === 'GET' && path === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                upstream: config.OPENAI_BASE_URL
            }));
            return;
        }

        // Check authentication
        if (!isAuthorized(req, requestUrl, config.REQUIRED_API_KEY)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: { message: 'Unauthorized: API key is invalid or missing.' }
            }));
            return;
        }

        try {
            // Get API service
            const apiService = await getApiService(config);

            // Handle API requests
            const apiHandled = await handleAPIRequests(
                method, path, req, res,
                config, apiService, PROMPT_LOG_FILENAME
            );

            if (apiHandled) return;

            // Fallback for unmatched routes
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Not Found' } }));
        } catch (error) {
            console.error('[Request] Error:', error);
            handleError(res, error);
        }
    };
}
