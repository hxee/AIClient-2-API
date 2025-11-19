import * as fs from 'fs';
import { promises as pfs } from 'fs';

export let CONFIG = {};
export let PROMPT_LOG_FILENAME = '';

const INPUT_SYSTEM_PROMPT_FILE = 'input_system_prompt.txt';

/**
 * Initializes the server configuration from config.json and command-line arguments.
 * Minimal version: only supports openai-custom provider
 */
export async function initializeConfig(args = process.argv.slice(2), configFilePath = 'config.json') {
    let currentConfig = {};

    // Try to load config.json
    try {
        const configData = fs.readFileSync(configFilePath, 'utf8');
        currentConfig = JSON.parse(configData);
        console.log('[Config] Loaded configuration from config.json');
    } catch (error) {
        console.error('[Config Error] Failed to load config.json:', error.message);
        // Use default configuration
        currentConfig = {
            REQUIRED_API_KEY: "123456",
            SERVER_PORT: 3000,
            HOST: 'localhost',
            SYSTEM_PROMPT_FILE_PATH: INPUT_SYSTEM_PROMPT_FILE,
            SYSTEM_PROMPT_MODE: 'append',
            PROMPT_LOG_BASE_NAME: "prompt_log",
            PROMPT_LOG_MODE: "none",
            OPENAI_API_KEY: "",
            OPENAI_BASE_URL: "https://api.openai.com/v1"
        };
        console.log('[Config] Using default configuration.');
    }

    // Parse command-line arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        switch (arg) {
            case '--api-key':
                if (nextArg) {
                    currentConfig.REQUIRED_API_KEY = nextArg;
                    i++;
                }
                break;
            case '--port':
                if (nextArg) {
                    currentConfig.SERVER_PORT = parseInt(nextArg, 10);
                    i++;
                }
                break;
            case '--host':
                if (nextArg) {
                    currentConfig.HOST = nextArg;
                    i++;
                }
                break;
            case '--openai-api-key':
                if (nextArg) {
                    currentConfig.OPENAI_API_KEY = nextArg;
                    i++;
                }
                break;
            case '--openai-base-url':
                if (nextArg) {
                    currentConfig.OPENAI_BASE_URL = nextArg;
                    i++;
                }
                break;
            case '--system-prompt-file':
                if (nextArg) {
                    currentConfig.SYSTEM_PROMPT_FILE_PATH = nextArg;
                    i++;
                }
                break;
            case '--system-prompt-mode':
                if (nextArg && (nextArg === 'overwrite' || nextArg === 'append')) {
                    currentConfig.SYSTEM_PROMPT_MODE = nextArg;
                    i++;
                }
                break;
            case '--log-prompts':
                if (nextArg && (nextArg === 'console' || nextArg === 'file' || nextArg === 'none')) {
                    currentConfig.PROMPT_LOG_MODE = nextArg;
                    i++;
                }
                break;
            case '--prompt-log-base-name':
                if (nextArg) {
                    currentConfig.PROMPT_LOG_BASE_NAME = nextArg;
                    i++;
                }
                break;
        }
    }

    // Load system prompt file content
    if (!currentConfig.SYSTEM_PROMPT_FILE_PATH) {
        currentConfig.SYSTEM_PROMPT_FILE_PATH = INPUT_SYSTEM_PROMPT_FILE;
    }
    currentConfig.SYSTEM_PROMPT_CONTENT = await getSystemPromptFileContent(currentConfig.SYSTEM_PROMPT_FILE_PATH);

    // Set prompt log filename
    if (currentConfig.PROMPT_LOG_MODE === 'file') {
        const now = new Date();
        const pad = (num) => String(num).padStart(2, '0');
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        PROMPT_LOG_FILENAME = `${currentConfig.PROMPT_LOG_BASE_NAME}-${timestamp}.log`;
    } else {
        PROMPT_LOG_FILENAME = '';
    }

    // Assign to the exported CONFIG
    Object.assign(CONFIG, currentConfig);
    return CONFIG;
}

/**
 * Gets system prompt content from the specified file path.
 */
export async function getSystemPromptFileContent(filePath) {
    try {
        await pfs.access(filePath, pfs.constants.F_OK);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`[System Prompt] File not found: ${filePath}`);
        } else {
            console.error(`[System Prompt] Error accessing file ${filePath}: ${error.message}`);
        }
        return null;
    }

    try {
        const content = await pfs.readFile(filePath, 'utf8');
        if (!content.trim()) {
            return null;
        }
        console.log(`[System Prompt] Loaded from ${filePath}`);
        return content;
    } catch (error) {
        console.error(`[System Prompt] Error reading file ${filePath}: ${error.message}`);
        return null;
    }
}
