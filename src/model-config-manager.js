import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let modelsConfig = null;

/**
 * Load models configuration from models.config.json
 * @returns {Promise<Object>} The loaded models configuration
 */
export async function loadModelsConfig() {
    if (modelsConfig) {
        return modelsConfig;
    }

    try {
        const configPath = path.join(__dirname, '..', 'models.config.json');
        const configContent = await fs.readFile(configPath, 'utf-8');
        modelsConfig = JSON.parse(configContent);
        console.log('[ModelConfig] Successfully loaded models.config.json');
        return modelsConfig;
    } catch (error) {
        console.error('[ModelConfig] Failed to load models.config.json:', error.message);
        throw new Error(`Failed to load models.config.json: ${error.message}`);
    }
}

/**
 * Get generic model identifiers (A, B, C, D)
 * @returns {Promise<Object>} The generic models configuration
 */
export async function getGenericModels() {
    const config = await loadModelsConfig();
    return config.models || {};
}

/**
 * Get provider-specific model mappings
 * @param {string} provider - The provider type (e.g., 'gemini-cli-oauth')
 * @returns {Promise<Object>} The provider-specific model mappings
 */
export async function getProviderModels(provider) {
    const config = await loadModelsConfig();
    return config.providers?.[provider] || {};
}

/**
 * Resolve a generic model identifier to a specific provider model
 * @param {string} modelId - The generic model identifier (A, B, C, D) or actual model name
 * @param {string} provider - The provider type
 * @returns {Promise<string>} The resolved provider-specific model ID
 */
export async function resolveModelId(modelId, provider) {
    if (!modelId) {
        throw new Error('Model ID is required');
    }

    // Try to load provider mappings
    const providerModels = await getProviderModels(provider);
    
    // If the modelId is a generic identifier (A, B, C, D), resolve it
    if (modelId in providerModels) {
        const resolvedId = providerModels[modelId];
        console.log(`[ModelConfig] Resolved model ${modelId} to ${resolvedId} for provider ${provider}`);
        return resolvedId;
    }

    // If not a generic identifier, return as-is (it's already a specific model name)
    console.log(`[ModelConfig] Model ${modelId} not found in generic mappings for ${provider}, using as-is`);
    return modelId;
}

/**
 * Get all available models for a provider in the expected format
 * @param {string} provider - The provider type
 * @param {string} format - The format ('openai' or 'gemini')
 * @param {Object} providerInfo - Additional provider information (e.g., vendor name)
 * @returns {Promise<Array>} The formatted model list
 */
export async function getProviderModelsList(provider, format = 'openai', providerInfo = {}) {
    const providerModels = await getProviderModels(provider);
    
    const models = [];
    for (const [key, value] of Object.entries(providerModels)) {
        const model = {
            id: value,
            name: value,
            displayName: value,
            generic_id: key // Store the generic ID for reference
        };

        if (format === 'openai') {
            models.push({
                id: value,
                object: 'model',
                created: Math.floor(Date.now() / 1000),
                owned_by: provider,
                permission: [],
                root: value,
                parent: null
            });
        } else if (format === 'gemini') {
            const displayName = value.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            models.push({
                name: `models/${value}`,
                version: '1.0.0',
                displayName: displayName,
                description: `Model: ${value}`,
                inputTokenLimit: 128000,
                outputTokenLimit: 4096,
                supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
            });
        }
    }

    return models;
}

/**
 * Clear the cached configuration (useful for testing)
 */
export function clearCache() {
    modelsConfig = null;
}
