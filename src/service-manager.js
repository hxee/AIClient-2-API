import { getServiceAdapter } from './adapter.js';

// Store the single OpenAI service instance
let openaiService = null;

/**
 * Initialize the OpenAI API service
 * Minimal version: only supports single openai-custom provider
 */
export async function initApiService(config) {
    console.log('[Service] Initializing OpenAI service...');

    try {
        openaiService = getServiceAdapter(config);
        console.log('[Service] ✓ OpenAI service initialized');
    } catch (error) {
        console.error('[Service] ✗ Failed to initialize OpenAI service:', error.message);
        throw error;
    }

    return { openai: openaiService };
}

/**
 * Get the OpenAI API service adapter
 * Minimal version: always returns the single OpenAI service
 */
export async function getApiService(config) {
    if (!openaiService) {
        console.log('[Service] Service not initialized, creating now...');
        openaiService = getServiceAdapter(config);
    }
    return openaiService;
}
