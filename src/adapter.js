/**
 * API Service Adapter - Minimal version
 * Only supports OpenAI service
 */

import { OpenAIApiService } from './openai/openai-core.js';

// Base adapter interface
export class ApiServiceAdapter {
    constructor() {
        if (new.target === ApiServiceAdapter) {
            throw new TypeError("Cannot construct ApiServiceAdapter instances directly");
        }
    }

    async generateContent(model, requestBody) {
        throw new Error("Method 'generateContent()' must be implemented.");
    }

    async *generateContentStream(model, requestBody) {
        throw new Error("Method 'generateContentStream()' must be implemented.");
    }

    async listModels() {
        throw new Error("Method 'listModels()' must be implemented.");
    }

    async refreshToken() {
        // Optional method - not all services need token refresh
    }
}

// OpenAI API Service Adapter
export class OpenAIApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.openAIApiService = new OpenAIApiService(config);
    }

    async generateContent(model, requestBody) {
        return this.openAIApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        yield* this.openAIApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        return this.openAIApiService.listModels();
    }

    async refreshToken() {
        // OpenAI doesn't need token refresh
    }
}

// Service instance cache
export const serviceInstances = {};

/**
 * Get or create service adapter
 */
export function getServiceAdapter(config) {
    const cacheKey = `openai-${config.OPENAI_BASE_URL || 'default'}`;

    if (!serviceInstances[cacheKey]) {
        console.log(`[Adapter] Creating new OpenAI service adapter`);
        serviceInstances[cacheKey] = new OpenAIApiServiceAdapter(config);
    }

    return serviceInstances[cacheKey];
}
