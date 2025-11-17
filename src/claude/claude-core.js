import axios from 'axios';
import { getClaudeModels } from '../models-config-manager.js';

/**
 * Claude API Core Service Class.
 * Encapsulates the interaction logic with the Anthropic Claude API.
 */
export class ClaudeApiService {
    /**
     * Constructor
     * @param {string} apiKey - Anthropic Claude API Key.
     * @param {string} baseUrl - Anthropic Claude API Base URL.
     */
    constructor(config) {
        if (!config.CLAUDE_API_KEY) {
            throw new Error("Claude API Key is required for ClaudeApiService.");
        }
        this.config = config;
        this.apiKey = config.CLAUDE_API_KEY;
        this.baseUrl = config.CLAUDE_BASE_URL;
        this.useSystemProxy = config?.USE_SYSTEM_PROXY_CLAUDE ?? false;
        console.log(`[Claude] System proxy ${this.useSystemProxy ? 'enabled' : 'disabled'}`);
        this.client = this.createClient();
    }

    /**
     * Creates an Axios instance for communication with the Claude API.
     * @returns {object} Axios instance.
     */
    createClient() {
        const axiosConfig = {
            baseURL: this.baseUrl,
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01', // Claude API 版本
            },
        };
        
        // Add User-Agent if configured
        if (this.config.userAgent) {
            axiosConfig.headers['User-Agent'] = this.config.userAgent;
        }
        
        // 禁用系统代理以避免HTTPS代理错误
        if (!this.useSystemProxy) {
            axiosConfig.proxy = false;
        }
        
        return axios.create(axiosConfig);
    }

    /**
     * Generic method to call the Claude API, with retry mechanism.
     * @param {string} endpoint - API endpoint, e.g., '/messages'.
     * @param {object} body - Request body.
     * @param {boolean} isRetry - Whether it's a retry call.
     * @param {number} retryCount - Current retry count.
     * @returns {Promise<object>} API response data.
     */
    async callApi(endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES;
        const baseDelay = this.config.REQUEST_BASE_DELAY; // 1 second base delay

        // 记录详细的请求信息
        const vendorName = this.config.vendorName || 'unknown';
        const fullUrl = `${this.baseUrl}${endpoint}`;
        console.log(`[Claude Request] Vendor: ${vendorName}, Method: POST, Full URL: ${fullUrl}, Model: ${body.model || 'N/A'}`);

        try {
            const response = await this.client.post(endpoint, body);
            return response.data;
        } catch (error) {
            // 对于 Claude API，401 通常意味着 API Key 无效，不进行重试
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.error(`[API] Received ${error.response.status}. API Key might be invalid or expired.`);
                throw error;
            }

            // 处理 429 (Too Many Requests) 与指数退避
            if (error.response?.status === 429 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                console.log(`[API] Received 429 (Too Many Requests). Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }

            // 处理其他可重试错误 (5xx 服务器错误)
            if (error.response?.status >= 500 && error.response?.status < 600 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                console.log(`[API] Received ${error.response.status} server error. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }

            console.error("[ClaudeApiService] Error calling API:", error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Generic method to stream from the Claude API, with retry mechanism.
     * @param {string} endpoint - API endpoint, e.g., '/messages'.
     * @param {object} body - Request body.
     * @param {boolean} isRetry - Whether it's a retry call.
     * @param {number} retryCount - Current retry count.
     * @returns {AsyncIterable<object>} API response stream.
     */
    async *streamApi(endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES;
        const baseDelay = this.config.REQUEST_BASE_DELAY; // 1 second base delay

        // 记录详细的请求信息
        const vendorName = this.config.vendorName || 'unknown';
        const fullUrl = `${this.baseUrl}${endpoint}`;
        console.log(`[Claude Stream Request] Vendor: ${vendorName}, Method: POST, Full URL: ${fullUrl}, Model: ${body.model || 'N/A'}`);

        try {
            const response = await this.client.post(endpoint, { ...body, stream: true }, { responseType: 'stream' });
            const reader = response.data;
            let buffer = '';

            for await (const chunk of reader) {
                buffer += chunk.toString('utf-8');
                let boundary;
                while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                    const eventBlock = buffer.substring(0, boundary);
                    buffer = buffer.substring(boundary + 2);

                    const lines = eventBlock.split('\n');
                    let data = '';
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            data = line.substring(6).trim();
                        }
                    }

                    if (data) {
                        try {
                            const parsedChunk = JSON.parse(data);
                            yield parsedChunk;
                            if (parsedChunk.type === 'message_stop') {
                                return;
                            }
                        } catch (e) {
                            console.warn("[ClaudeApiService] Failed to parse stream chunk JSON:", e.message, "Data:", data);
                        }
                    }
                }
            }
        } catch (error) {
            // 对于 Claude API，401 通常意味着 API Key 无效，不进行重试
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.error(`[API] Received ${error.response.status} during stream. API Key might be invalid or expired.`);
                throw error;
            }

            // 处理 429 (Too Many Requests) 与指数退避
            if (error.response?.status === 429 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                console.log(`[API] Received 429 (Too Many Requests) during stream. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }

            // 处理其他可重试错误 (5xx 服务器错误)
            if (error.response?.status >= 500 && error.response?.status < 600 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                console.log(`[API] Received ${error.response.status} server error during stream. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }

            console.error("[ClaudeApiService] Error generating content stream:", error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Generates content (non-streaming).
     * @param {string} model - Model name.
     * @param {object} requestBody - Request body (Claude format).
     * @returns {Promise<object>} Claude API response (Claude compatible format).
     */
    async generateContent(model, requestBody) {
        const response = await this.callApi('/messages', requestBody);
        return response;
    }

    /**
     * Streams content generation.
     * @param {string} model - Model name.
     * @param {object} requestBody - Request body (Claude format).
     * @returns {AsyncIterable<object>} Claude API response stream (Claude compatible format).
     */
    async *generateContentStream(model, requestBody) {
        const stream = this.streamApi('/messages', requestBody);
        for await (const chunk of stream) {
            yield chunk;
        }
    }

    /**
     * Lists available models.
     * Reads models from the unified configuration file.
     * @returns {Promise<object>} List of models.
     */
    async listModels() {
        console.log('[ClaudeApiService] Listing available models from config.');
        try {
            // 从统一配置文件读取模型列表
            const modelIds = await getClaudeModels();
            const models = modelIds.map(id => ({
                id: id,
                name: id
            }));
            
            return { models: models.map(m => ({ name: m.name })) };
        } catch (error) {
            console.error(`Error listing Claude models from config:`, error.message);
            throw error;
        }
    }
}
