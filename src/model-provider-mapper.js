/**
 * Model to Provider Mapper
 * Maps model names to their corresponding providers
 */

import { MODEL_PROVIDER, removeModelPrefix, getProviderFromPrefix } from './common.js';

/**
 * Get provider type for a given model name
 * @param {string} modelName - The model name to look up (may include prefix like "[Gemini] gemini-2.0")
 * @param {string} defaultProvider - The default provider if no match is found
 * @returns {string} The provider type
 */
export function getProviderForModel(modelName, defaultProvider) {
    if (!modelName) {
        return defaultProvider;
    }

    // First, check if model name has a prefix that directly indicates the provider
    const providerFromPrefix = getProviderFromPrefix(modelName);
    if (providerFromPrefix) {
        return providerFromPrefix;
    }
    
    // Remove prefix for further analysis
    const cleanModelName = removeModelPrefix(modelName);
    const lowerModel = cleanModelName.toLowerCase();

    // Gemini models
    if (lowerModel.includes('gemini')) {
        return MODEL_PROVIDER.GEMINI_CLI;
    }

    // Claude models
    if (lowerModel.includes('claude')) {
        // Check if it's a Kiro model
        if (lowerModel.includes('amazonq')) {
            return MODEL_PROVIDER.KIRO_API;
        }
        return MODEL_PROVIDER.CLAUDE_CUSTOM;
    }

    // Qwen models
    if (lowerModel.includes('qwen')) {
        return MODEL_PROVIDER.QWEN_API;
    }

    // OpenAI models
    if (lowerModel.includes('gpt') || lowerModel.includes('o1') || lowerModel.includes('o3')) {
        return MODEL_PROVIDER.OPENAI_CUSTOM;
    }

    // Default to the provided default provider
    return defaultProvider;
}

/**
 * Check if a model belongs to a specific provider
 * @param {string} modelName - The model name
 * @param {string} providerType - The provider type to check
 * @returns {boolean} True if the model belongs to the provider
 */
export function isModelFromProvider(modelName, providerType) {
    const detectedProvider = getProviderForModel(modelName, null);
    return detectedProvider === providerType;
}
