/**
 * API Manager - Minimal version
 * Handles routing for the three core endpoints
 */

import { handleModelListRequest, handleContentGenerationRequest } from './common.js';

// Endpoint types
const ENDPOINT_TYPE = {
    OPENAI_MODEL_LIST: 'openai-model-list',
    OPENAI_CHAT: 'openai-chat',
    CLAUDE_MESSAGE: 'claude-message'
};

/**
 * Handle API requests - routes to appropriate handlers
 */
export async function handleAPIRequests(method, path, req, res, config, apiService, promptLogFilename) {
    // Route model list request
    if (method === 'GET' && path === '/v1/models') {
        await handleModelListRequest(req, res, apiService, ENDPOINT_TYPE.OPENAI_MODEL_LIST, config);
        return true;
    }

    // Route content generation requests
    if (method === 'POST') {
        if (path === '/v1/chat/completions') {
            await handleContentGenerationRequest(
                req, res, apiService,
                ENDPOINT_TYPE.OPENAI_CHAT,
                config, promptLogFilename
            );
            return true;
        }

        if (path === '/v1/messages') {
            await handleContentGenerationRequest(
                req, res, apiService,
                ENDPOINT_TYPE.CLAUDE_MESSAGE,
                config, promptLogFilename
            );
            return true;
        }
    }

    return false;
}

export { ENDPOINT_TYPE };
