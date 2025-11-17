import * as fs from 'fs';
import { promises as pfs } from 'fs';
import { INPUT_SYSTEM_PROMPT_FILE, MODEL_PROVIDER } from './common.js';

export let CONFIG = {}; // Make CONFIG exportable
export let PROMPT_LOG_FILENAME = ''; // Make PROMPT_LOG_FILENAME exportable

const ALL_MODEL_PROVIDERS = Object.values(MODEL_PROVIDER);

function normalizeConfiguredProviders(config) {
    const fallbackProvider = MODEL_PROVIDER.GEMINI_CLI;
    const dedupedProviders = [];

    const addProvider = (value) => {
        if (typeof value !== 'string') {
            return;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return;
        }
        const matched = ALL_MODEL_PROVIDERS.find((provider) => provider.toLowerCase() === trimmed.toLowerCase());
        if (!matched) {
            console.warn(`[Config Warning] Unknown model provider '${trimmed}'. This entry will be ignored.`);
            return;
        }
        if (!dedupedProviders.includes(matched)) {
            dedupedProviders.push(matched);
        }
    };

    const rawValue = config.MODEL_PROVIDER;
    if (Array.isArray(rawValue)) {
        rawValue.forEach((entry) => addProvider(typeof entry === 'string' ? entry : String(entry)));
    } else if (typeof rawValue === 'string') {
        rawValue.split(',').forEach(addProvider);
    } else if (rawValue != null) {
        addProvider(String(rawValue));
    }

    if (dedupedProviders.length === 0) {
        dedupedProviders.push(fallbackProvider);
    }

    config.DEFAULT_MODEL_PROVIDERS = dedupedProviders;
    config.MODEL_PROVIDER = dedupedProviders[0];
}

/**
 * Initializes the server configuration from config.json and command-line arguments.
 * @param {string[]} args - Command-line arguments.
 * @param {string} [configFilePath='config.json'] - Path to the configuration file.
 * @returns {Object} The initialized configuration object.
 */
export async function initializeConfig(args = process.argv.slice(2), configFilePath = 'config.json') {
    let currentConfig = {};

    try {
        const configData = fs.readFileSync(configFilePath, 'utf8');
        currentConfig = JSON.parse(configData);
        console.log('[Config] Loaded configuration from config.json');
    } catch (error) {
        console.error('[Config Error] Failed to load config.json:', error.message);
        // Fallback to default values if config.json is not found or invalid
        currentConfig = {
            REQUIRED_API_KEY: "123456",
            SERVER_PORT: 3000,
            HOST: 'localhost',
            SYSTEM_PROMPT_FILE_PATH: INPUT_SYSTEM_PROMPT_FILE,
            SYSTEM_PROMPT_MODE: 'append',
            PROMPT_LOG_BASE_NAME: "prompt_log",
            PROMPT_LOG_MODE: "none",
            REQUEST_MAX_RETRIES: 3,
            REQUEST_BASE_DELAY: 1000,
            CRON_NEAR_MINUTES: 15,
            CRON_REFRESH_TOKEN: false,
            PROVIDER_FILE_PATH: 'provider.json'
        };
        console.log('[Config] Using default configuration.');
    }

    // Parse command-line arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--api-key') {
            if (i + 1 < args.length) {
                currentConfig.REQUIRED_API_KEY = args[i + 1];
                i++;
            } else {
                console.warn(`[Config Warning] --api-key flag requires a value.`);
            }
        } else if (args[i] === '--log-prompts') {
            if (i + 1 < args.length) {
                const mode = args[i + 1];
                if (mode === 'console' || mode === 'file') {
                    currentConfig.PROMPT_LOG_MODE = mode;
                } else {
                    console.warn(`[Config Warning] Invalid mode for --log-prompts. Expected 'console' or 'file'. Prompt logging is disabled.`);
                }
                i++;
            } else {
                console.warn(`[Config Warning] --log-prompts flag requires a value.`);
            }
        } else if (args[i] === '--port') {
            if (i + 1 < args.length) {
                currentConfig.SERVER_PORT = parseInt(args[i + 1], 10);
                i++;
            } else {
                console.warn(`[Config Warning] --port flag requires a value.`);
            }
        } else if (args[i] === '--system-prompt-file') {
            if (i + 1 < args.length) {
                currentConfig.SYSTEM_PROMPT_FILE_PATH = args[i + 1];
                i++;
            } else {
                console.warn(`[Config Warning] --system-prompt-file flag requires a value.`);
            }
        } else if (args[i] === '--system-prompt-mode') {
            if (i + 1 < args.length) {
                const mode = args[i + 1];
                if (mode === 'overwrite' || mode === 'append') {
                    currentConfig.SYSTEM_PROMPT_MODE = mode;
                } else {
                    console.warn(`[Config Warning] Invalid mode for --system-prompt-mode. Expected 'overwrite' or 'append'. Using default 'overwrite'.`);
                }
                i++;
            } else {
                console.warn(`[Config Warning] --system-prompt-mode flag requires a value.`);
            }
        } else if (args[i] === '--host') {
            if (i + 1 < args.length) {
                currentConfig.HOST = args[i + 1];
                i++;
            } else {
                console.warn(`[Config Warning] --host flag requires a value.`);
            }
        } else if (args[i] === '--prompt-log-base-name') {
            if (i + 1 < args.length) {
                currentConfig.PROMPT_LOG_BASE_NAME = args[i + 1];
                i++;
            } else {
                console.warn(`[Config Warning] --prompt-log-base-name flag requires a value.`);
            }
        } else if (args[i] === '--cron-near-minutes') {
            if (i + 1 < args.length) {
                currentConfig.CRON_NEAR_MINUTES = parseInt(args[i + 1], 10);
                i++;
            } else {
                console.warn(`[Config Warning] --cron-near-minutes flag requires a value.`);
            }
        } else if (args[i] === '--cron-refresh-token') {
            if (i + 1 < args.length) {
                currentConfig.CRON_REFRESH_TOKEN = args[i + 1].toLowerCase() === 'true';
                i++;
            } else {
                console.warn(`[Config Warning] --cron-refresh-token flag requires a value.`);
            }
        } else if (args[i] === '--provider-pools-file') {
            if (i + 1 < args.length) {
                currentConfig.PROVIDER_FILE_PATH = args[i + 1];
                i++;
            } else {
                console.warn(`[Config Warning] --provider-pools-file flag requires a value.`);
            }
        }
    }

    if (!currentConfig.SYSTEM_PROMPT_FILE_PATH) {
        currentConfig.SYSTEM_PROMPT_FILE_PATH = INPUT_SYSTEM_PROMPT_FILE;
    }
    currentConfig.SYSTEM_PROMPT_CONTENT = await getSystemPromptFileContent(currentConfig.SYSTEM_PROMPT_FILE_PATH);

    // 加载号池配置
    if (currentConfig.PROVIDER_FILE_PATH) {
        try {
            const poolsData = await pfs.readFile(currentConfig.PROVIDER_FILE_PATH, 'utf8');
            currentConfig.providerPools = JSON.parse(poolsData);
            console.log(`[Config] Loaded provider pools from ${currentConfig.PROVIDER_FILE_PATH}`);
            
            // 自动检测可用的提供商类型
            const availableProviders = [];
            for (const [providerType, poolData] of Object.entries(currentConfig.providerPools)) {
                // 兼容新旧格式：提取 providers 数组
                const providers = Array.isArray(poolData) ? poolData : (poolData.providers || []);
                // 检查该类型是否有提供商配置（不管健康状态）
                if (providers.length > 0) {
                    availableProviders.push(providerType);
                    console.log(`[Config] Found provider type: ${providerType} with ${providers.length} credential(s)`);
                }
            }
            
            if (availableProviders.length > 0) {
                currentConfig.DEFAULT_MODEL_PROVIDERS = availableProviders;
                currentConfig.MODEL_PROVIDER = availableProviders[0]; // 设置第一个为主提供商
                console.log(`[Config] Auto-detected available providers: ${availableProviders.join(', ')}`);
                console.log(`[Config] Primary provider set to: ${currentConfig.MODEL_PROVIDER}`);
            } else {
                console.warn('[Config] No providers found in provider pools, using fallback');
                currentConfig.DEFAULT_MODEL_PROVIDERS = [MODEL_PROVIDER.GEMINI_CLI];
                currentConfig.MODEL_PROVIDER = MODEL_PROVIDER.GEMINI_CLI;
            }
        } catch (error) {
            console.error(`[Config Error] Failed to load provider pools from ${currentConfig.PROVIDER_FILE_PATH}: ${error.message}`);
            currentConfig.providerPools = {};
            currentConfig.DEFAULT_MODEL_PROVIDERS = [];
            currentConfig.MODEL_PROVIDER = null;
        }
    } else {
        console.warn('[Config] PROVIDER_FILE_PATH not configured, using fallback provider');
        currentConfig.providerPools = {};
        currentConfig.DEFAULT_MODEL_PROVIDERS = [MODEL_PROVIDER.GEMINI_CLI];
        currentConfig.MODEL_PROVIDER = MODEL_PROVIDER.GEMINI_CLI;
    }

    // Set PROMPT_LOG_FILENAME based on the determined config
    if (currentConfig.PROMPT_LOG_MODE === 'file') {
        const now = new Date();
        const pad = (num) => String(num).padStart(2, '0');
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        PROMPT_LOG_FILENAME = `${currentConfig.PROMPT_LOG_BASE_NAME}-${timestamp}.log`;
    } else {
        PROMPT_LOG_FILENAME = ''; // Clear if not logging to file
    }

    // Assign to the exported CONFIG
    Object.assign(CONFIG, currentConfig);
    return CONFIG;
}

/**
 * Gets system prompt content from the specified file path.
 * @param {string} filePath - Path to the system prompt file.
 * @returns {Promise<string|null>} File content, or null if the file does not exist, is empty, or an error occurs.
 */
export async function getSystemPromptFileContent(filePath) {
    try {
        await pfs.access(filePath, pfs.constants.F_OK);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`[System Prompt] Specified system prompt file not found: ${filePath}`);
        } else {
            console.error(`[System Prompt] Error accessing system prompt file ${filePath}: ${error.message}`);
        }
        return null;
    }

    try {
        const content = await pfs.readFile(filePath, 'utf8');
        if (!content.trim()) {
            return null;
        }
        console.log(`[System Prompt] Loaded system prompt from ${filePath}`);
        return content;
    } catch (error) {
        console.error(`[System Prompt] Error reading system prompt file ${filePath}: ${error.message}`);
        return null;
    }
}

/**
 * Logs provider-specific configuration details
 * @param {string} provider - The model provider
 * @param {Object} config - The configuration object
 */
export function logProviderSpecificDetails(provider, config) {
    // Provider credentials are now managed in provider.json
    // Log pool information for load balancing
    if (config.providerPools && config.providerPools[provider]) {
        // 兼容新旧格式：对象格式（自定义渠道）或数组格式（OAuth渠道）
        const poolData = config.providerPools[provider];
        const providers = Array.isArray(poolData) ? poolData : (poolData.providers || []);
        const healthyCount = providers.filter(p => p.isHealthy !== false && p.isDisabled !== true).length;
        const totalCount = providers.length;
        
        console.log(`  [${provider}] Pool: ${totalCount} credential(s), ${healthyCount} available for load balancing`);
        
        // 显示每个凭据的状态
        providers.forEach((p, index) => {
            const status = p.isDisabled ? 'disabled' : (p.isHealthy === false ? 'unhealthy' : 'healthy');
            const usage = p.usageCount || 0;
            console.log(`    - Credential #${index + 1} [${p.uuid.substring(0, 8)}...]: ${status}, used ${usage} times`);
        });
    } else {
        console.log(`  [${provider}] No credentials configured in pool`);
    }
}

export { ALL_MODEL_PROVIDERS };