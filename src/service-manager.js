import { getServiceAdapter, serviceInstances } from './adapter.js';
import { ProviderPoolManager } from './provider-pool-manager.js';
import deepmerge from 'deepmerge';

// 存储 ProviderPoolManager 实例
let providerPoolManager = null;

/**
 * Initialize API services and provider pool manager
 * @param {Object} config - The server configuration
 * @returns {Promise<Object>} The initialized services
 */
export async function initApiService(config) {
    if (config.providerPools && Object.keys(config.providerPools).length > 0) {
        providerPoolManager = new ProviderPoolManager(config.providerPools, { globalConfig: config });
        console.log('[Initialization] ProviderPoolManager initialized with configured pools.');
        // 健康检查将在服务器完全启动后执行
    } else {
        console.log('[Initialization] No provider pools configured. Using single provider mode.');
    }

    // Initialize configured service adapters at startup
    // 对于未纳入号池的提供者，提前初始化以避免首个请求的额外延迟
    const providersToInit = new Set();
    if (Array.isArray(config.DEFAULT_MODEL_PROVIDERS)) {
        config.DEFAULT_MODEL_PROVIDERS.forEach((provider) => providersToInit.add(provider));
    }
    if (config.providerPools) {
        Object.keys(config.providerPools).forEach((provider) => providersToInit.add(provider));
    }
    if (providersToInit.size === 0) {
        const { ALL_MODEL_PROVIDERS } = await import('./config-manager.js');
        ALL_MODEL_PROVIDERS.forEach((provider) => providersToInit.add(provider));
    }

    for (const provider of providersToInit) {
        const { ALL_MODEL_PROVIDERS } = await import('./config-manager.js');
        if (!ALL_MODEL_PROVIDERS.includes(provider)) {
            console.warn(`[Initialization Warning] Skipping unknown model provider '${provider}' during adapter initialization.`);
            continue;
        }
        if (config.providerPools && config.providerPools[provider] && config.providerPools[provider].length > 0) {
            // 由号池管理器负责按需初始化
            continue;
        }
        try {
            console.log(`[Initialization] Initializing single service adapter for ${provider}...`);
            getServiceAdapter({ ...config, MODEL_PROVIDER: provider });
        } catch (error) {
            console.warn(`[Initialization Warning] Failed to initialize single service adapter for ${provider}: ${error.message}`);
        }
    }
    return serviceInstances; // Return the collection of initialized service instances
}

/**
 * Get API service adapter, considering provider pools
 * @param {Object} config - The current request configuration
 * @param {Object} providerPoolManager - Optional provider pool manager instance
 * @returns {Promise<Object>} The API service adapter
 */
export async function getApiService(config, providerPoolManagerParam = null) {
    console.log(`[Service Manager] getApiService called with MODEL_PROVIDER: ${config.MODEL_PROVIDER}`);
    console.log(`[Service Manager] Provider pools available: ${config.providerPools ? Object.keys(config.providerPools).join(', ') : 'none'}`);
    
    const poolManager = providerPoolManagerParam || providerPoolManager;
    let serviceConfig = config;
    
    if (poolManager && config.providerPools && config.providerPools[config.MODEL_PROVIDER]) {
        console.log(`[Service Manager] Found pool for ${config.MODEL_PROVIDER}, selecting from pool...`);
        // 如果有号池管理器，并且当前模型提供者类型有对应的号池，则从号池中选择一个提供者配置
        // 传递模型名称用于检查映射配置
        const selectedProviderConfig = poolManager.selectProvider(config.MODEL_PROVIDER, config.uuid, config.requestedModel);
        if (selectedProviderConfig) {
            // 合并选中的提供者配置到当前请求的 config 中
            serviceConfig = deepmerge(config, selectedProviderConfig);
            delete serviceConfig.providerPools; // 移除 providerPools 属性
            config.uuid = serviceConfig.uuid;
            console.log(`[Service Manager] ✓ Using pooled configuration for ${config.MODEL_PROVIDER}`);
            console.log(`[Service Manager]   - UUID: ${serviceConfig.uuid}`);
            console.log(`[Service Manager]   - Has API Key: ${!!(serviceConfig.OPENAI_API_KEY || serviceConfig.CLAUDE_API_KEY)}`);
            console.log(`[Service Manager]   - Has OAuth: ${!!(serviceConfig.GEMINI_OAUTH_CREDS_FILE_PATH || serviceConfig.KIRO_OAUTH_CREDS_FILE_PATH || serviceConfig.QWEN_OAUTH_CREDS_FILE_PATH)}`);
        } else {
            console.warn(`[Service Manager] ✗ No healthy provider found in pool for ${config.MODEL_PROVIDER}. Falling back to main config.`);
        }
    } else {
        console.log(`[Service Manager] No pool configured for ${config.MODEL_PROVIDER}, using default config`);
    }
    
    console.log(`[Service Manager] Final service config MODEL_PROVIDER: ${serviceConfig.MODEL_PROVIDER}`);
    return getServiceAdapter(serviceConfig);
}

/**
 * Get the provider pool manager instance
 * @returns {Object} The provider pool manager
 */
export function getProviderPoolManager() {
    return providerPoolManager;
}

/**
 * Mark provider as unhealthy
 * @param {string} provider - The model provider
 * @param {Object} providerInfo - Provider information including uuid
 */
export function markProviderUnhealthy(provider, providerInfo) {
    if (providerPoolManager) {
        providerPoolManager.markProviderUnhealthy(provider, providerInfo);
    }
}
