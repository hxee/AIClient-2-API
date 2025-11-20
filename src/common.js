import { promises as fs } from 'fs';
import * as path from 'path';
import { convertData, getOpenAIStreamChunkStop } from './convert.js';
import { ProviderStrategyFactory } from './provider-strategies.js';

// ============================================================
// 核心常量定义 - 只保留必要的端点类型
// ============================================================

// Minimal version: 只支持 OpenAI 和 Claude 端点
export const ENDPOINT_TYPE = {
    OPENAI_CHAT: 'openai-chat',
    CLAUDE_MESSAGE: 'claude-message',
    OPENAI_MODEL_LIST: 'openai-model-list',
};

export const FETCH_SYSTEM_PROMPT_FILE = path.join(process.cwd(), 'fetch_system_prompt.txt');
export const INPUT_SYSTEM_PROMPT_FILE = path.join(process.cwd(), 'input_system_prompt.txt');

// ============================================================
// 工具函数
// ============================================================

/**
 * 从提供商字符串中提取协议前缀
 * 精简版：只处理 'openai' 和 'claude'
 * @param {string} provider - 提供商字符串（例如 'openai-custom', 'claude-custom'）
 * @returns {string} 协议前缀（'openai' 或 'claude'）
 */
export function getProtocolPrefix(provider) {
    const hyphenIndex = provider.indexOf('-');
    if (hyphenIndex !== -1) {
        return provider.substring(0, hyphenIndex);
    }
    return provider;
}

/**
 * 读取完整的 HTTP 请求体
 * @param {http.IncomingMessage} req - HTTP 请求对象
 * @returns {Promise<Object>} 解析后的 JSON 请求体
 * @throws {Error} 如果请求体不是有效的 JSON
 */
export function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            if (!body) {
                return resolve({});
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("Invalid JSON in request body."));
            }
        });
        req.on('error', err => {
            reject(err);
        });
    });
}

/**
 * 记录对话日志
 * @param {string} type - 日志类型（'input' 或 'output'）
 * @param {string} content - 日志内容
 * @param {string} logMode - 日志模式（'none', 'console', 'file'）
 * @param {string} logFilename - 日志文件名
 */
export async function logConversation(type, content, logMode, logFilename) {
    if (logMode === 'none') return;
    if (!content) return;

    const timestamp = new Date().toLocaleString();
    const logEntry = `${timestamp} [${type.toUpperCase()}]:\n${content}\n--------------------------------------\n`;

    if (logMode === 'console') {
        console.log(logEntry);
    } else if (logMode === 'file') {
        try {
            await fs.appendFile(logFilename, logEntry);
        } catch (err) {
            console.error(`[Error] Failed to write conversation log to ${logFilename}:`, err);
        }
    }
}

/**
 * 检查请求是否已授权（基于 API 密钥）
 * 精简版：只保留必要的授权头检查
 * @param {http.IncomingMessage} req - HTTP 请求对象
 * @param {URL} requestUrl - 解析后的 URL 对象
 * @param {string} REQUIRED_API_KEY - 所需的 API 密钥
 * @returns {boolean} 如果已授权则返回 true，否则返回 false
 */
export function isAuthorized(req, requestUrl, REQUIRED_API_KEY) {
    const authHeader = req.headers['authorization'];
    const queryKey = requestUrl.searchParams.get('key');
    const claudeApiKey = req.headers['x-api-key']; // Claude 风格的头部

    // 检查 Authorization 头中的 Bearer token（OpenAI 风格）
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === REQUIRED_API_KEY) {
            return true;
        }
    }

    // 检查 URL 查询参数中的 API 密钥
    if (queryKey === REQUIRED_API_KEY) {
        return true;
    }

    // 检查 x-api-key 头（Claude 风格）
    if (claudeApiKey === REQUIRED_API_KEY) {
        return true;
    }

    console.log(`[Auth] Unauthorized request denied. Bearer: "${authHeader ? 'present' : 'N/A'}", Query Key: "${queryKey}", x-api-key: "${claudeApiKey}"`);
    return false;
}

// ============================================================
// 响应处理
// ============================================================

/**
 * 处理统一响应的通用逻辑（非流式和流式）
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @param {Object} responsePayload - 实际的响应负载
 * @param {boolean} isStream - 是否为流式响应
 */
export async function handleUnifiedResponse(res, responsePayload, isStream) {
    if (isStream) {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked"
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
    }

    if (!isStream) {
        res.end(responsePayload);
    }
}

/**
 * 处理流式请求
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @param {ApiServiceAdapter} service - API 服务适配器
 * @param {string} model - 模型名称
 * @param {Object} requestBody - 请求体
 * @param {string} fromProvider - 客户端协议（'openai' 或 'claude'）
 * @param {string} toProvider - 上游协议（始终为 'openai'）
 * @param {string} PROMPT_LOG_MODE - 提示词日志模式
 * @param {string} PROMPT_LOG_FILENAME - 提示词日志文件名
 */
export async function handleStreamRequest(res, service, model, requestBody, fromProvider, toProvider, PROMPT_LOG_MODE, PROMPT_LOG_FILENAME) {
    let fullResponseText = '';
    let responseClosed = false;

    await handleUnifiedResponse(res, '', true);

    const needsConversion = getProtocolPrefix(fromProvider) !== getProtocolPrefix(toProvider);
    requestBody.model = model;
    const nativeStream = await service.generateContentStream(model, requestBody);

    // 判断是否需要添加 event 前缀（Claude 格式需要）
    const addEvent = getProtocolPrefix(fromProvider) === 'claude';
    // 判断是否需要发送结束标记（OpenAI 格式需要）
    const openStop = getProtocolPrefix(fromProvider) === 'openai';

    try {
        for await (const nativeChunk of nativeStream) {
            // 提取文本用于日志记录
            const chunkText = extractResponseText(nativeChunk, toProvider);
            if (chunkText && !Array.isArray(chunkText)) {
                fullResponseText += chunkText;
                if (process.stdout.isTTY) {
                    process.stdout.write(chunkText);
                }
            }

            // 如果需要，将完整的块对象转换为客户端格式
            const chunkToSend = needsConversion
                ? convertData(nativeChunk, 'streamChunk', toProvider, fromProvider, model)
                : nativeChunk;

            if (!chunkToSend) {
                continue;
            }

            // 处理 chunkToSend 可能是数组或对象的情况
            const chunksToSend = Array.isArray(chunkToSend) ? chunkToSend : [chunkToSend];

            for (const chunk of chunksToSend) {
                if (addEvent) {
                    res.write(`event: ${chunk.type}\n`);
                    if (process.env.DEBUG_STREAM) {
                        process.stdout.write(`event: ${chunk.type}\n`);
                    }
                }

                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                if (process.env.DEBUG_STREAM) {
                    process.stdout.write(`data: ${JSON.stringify(chunk)}\n`);
                }
            }
        }

        // 如果是 OpenAI 格式且需要转换，发送结束标记
        if (openStop && needsConversion) {
            res.write(`data: ${JSON.stringify(getOpenAIStreamChunkStop(model))}\n\n`);
            if (process.env.DEBUG_STREAM) {
                process.stdout.write(`data: ${JSON.stringify(getOpenAIStreamChunkStop(model))}\n`);
            }
        }

    } catch (error) {
        process.stderr.write(`\n[Server] Error during stream processing: ${error.stack}\n`);

        if (!res.writableEnded) {
            const errorPayload = { error: { message: "An error occurred during streaming.", details: error.message } };
            res.end(JSON.stringify(errorPayload));
            responseClosed = true;
        }

    } finally {
        if (!responseClosed) {
            res.end();
        }
        if (process.stdout.isTTY && fullResponseText) {
            process.stdout.write('\n');
        }
        await logConversation('output', fullResponseText, PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);
    }
}

/**
 * 处理非流式请求
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @param {ApiServiceAdapter} service - API 服务适配器
 * @param {string} model - 模型名称
 * @param {Object} requestBody - 请求体
 * @param {string} fromProvider - 客户端协议（'openai' 或 'claude'）
 * @param {string} toProvider - 上游协议（始终为 'openai'）
 * @param {string} PROMPT_LOG_MODE - 提示词日志模式
 * @param {string} PROMPT_LOG_FILENAME - 提示词日志文件名
 */
export async function handleUnaryRequest(res, service, model, requestBody, fromProvider, toProvider, PROMPT_LOG_MODE, PROMPT_LOG_FILENAME) {
    try {
        setImmediate(() => {
            process.stdout.write(`[Unary Request] Starting content generation - fromProvider: ${fromProvider}, toProvider: ${toProvider}, model: ${model}\n`);
        });

        const needsConversion = getProtocolPrefix(fromProvider) !== getProtocolPrefix(toProvider);
        requestBody.model = model;

        setImmediate(() => {
            process.stdout.write(`[Unary Request] Calling service.generateContent...\n`);
        });
        const nativeResponse = await service.generateContent(model, requestBody);
        setImmediate(() => {
            process.stdout.write(`[Unary Request] ✓ Received response from service\n`);
        });

        const responseText = extractResponseText(nativeResponse, toProvider);

        // 如果需要，将响应转换回客户端格式
        let clientResponse = nativeResponse;
        if (needsConversion) {
            setImmediate(() => {
                process.stdout.write(`[Response Convert] Converting response from ${toProvider} to ${fromProvider}\n`);
            });
            clientResponse = convertData(nativeResponse, 'response', toProvider, fromProvider, model);
        }

        setImmediate(() => {
            process.stdout.write(`[Unary Request] Sending response to client\n`);
        });
        await handleUnifiedResponse(res, JSON.stringify(clientResponse), false);
        await logConversation('output', responseText, PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);
        setImmediate(() => {
            process.stdout.write(`[Unary Request] ✓ Request completed successfully\n`);
        });
    } catch (error) {
        setImmediate(() => {
            process.stderr.write(`\n[Server] Error during unary processing: ${error.stack}\n`);
        });

        const errorResponse = {
            error: {
                message: error.message || "An error occurred during processing.",
                code: error.status || 500,
                details: error.stack
            }
        };

        setImmediate(() => {
            process.stdout.write(`[Unary Request] Sending error response to client\n`);
        });
        await handleUnifiedResponse(res, JSON.stringify(errorResponse), false);
    }
}

// ============================================================
// 请求处理器
// ============================================================

/**
 * 处理模型列表请求
 * 精简版：直接从上游 OpenAI API 获取模型
 * @param {http.IncomingMessage} req - HTTP 请求对象
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @param {ApiServiceAdapter} service - API 服务适配器
 * @param {string} endpointType - 端点类型
 * @param {Object} CONFIG - 服务器配置对象
 */
export async function handleModelListRequest(req, res, service, endpointType, CONFIG) {
    const startTime = Date.now();

    try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`=== REQUEST INFO === (from client)`);
        console.log(`Time: ${new Date().toISOString()}`);
        console.log(`Method: ${req.method}`);
        console.log(`URL: ${req.url}`);
        console.log(`Client IP: ${req.socket.remoteAddress}`);
        console.log(`Headers:`, JSON.stringify({
            'user-agent': req.headers['user-agent'],
            'authorization': req.headers.authorization ? 'Bearer ***' : 'None',
            'content-type': req.headers['content-type']
        }, null, 2));
        console.log(`Endpoint Type: ${endpointType}`);
        console.log(`${'='.repeat(60)}`);

        // 精简版只支持 OpenAI 格式
        if (endpointType !== 'openai-model-list') {
            throw new Error(`Unsupported endpoint type: ${endpointType}. Minimal version only supports openai-model-list`);
        }

        console.log(`\n=== API REQUEST INFO === (to upstream)`);
        console.log(`Upstream: ${CONFIG.OPENAI_BASE_URL}`);
        console.log(`Endpoint: GET /models`);
        console.log(`API Key: ${CONFIG.OPENAI_API_KEY ? `${CONFIG.OPENAI_API_KEY.substring(0, 10)}...` : 'Not configured'}`);
        console.log(`${'='.repeat(60)}\n`);

        console.log(`[ModelList] Fetching models from upstream...`);
        const modelsResponse = await service.listModels();

        const elapsed = Date.now() - startTime;
        const modelCount = modelsResponse.data?.length || 0;

        console.log(`[ModelList] ✓ Fetched ${modelCount} models from upstream (${elapsed}ms)`);
        console.log(`[ModelList] Sending response to client\n`);

        // 直接返回上游响应
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(modelsResponse));

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`\n[ModelList] ✗ Error fetching models (${elapsed}ms):`, error.message);
        console.error(`[ModelList] Stack trace:`, error.stack);

        if (!res.headersSent) {
            res.writeHead(500, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
                error: {
                    message: error.message,
                    type: 'upstream_error'
                }
            }));
        }
    }
}

/**
 * 处理内容生成请求（非流式和流式）
 * 精简版：直接代理 OpenAI，可选的 Claude 格式转换
 * @param {http.IncomingMessage} req - HTTP 请求对象
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @param {ApiServiceAdapter} service - API 服务适配器（OpenAI）
 * @param {string} endpointType - 端点类型（openai-chat 或 claude-message）
 * @param {Object} CONFIG - 服务器配置对象
 * @param {string} PROMPT_LOG_FILENAME - 提示词日志文件名
 */
export async function handleContentGenerationRequest(req, res, service, endpointType, CONFIG, PROMPT_LOG_FILENAME) {
    const startTime = Date.now();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== REQUEST INFO === (from client)`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);
    console.log(`Client IP: ${req.socket.remoteAddress}`);
    console.log(`Headers:`, JSON.stringify({
        'user-agent': req.headers['user-agent'],
        'authorization': req.headers.authorization ? 'Bearer ***' : 'None',
        'content-type': req.headers['content-type']
    }, null, 2));
    console.log(`Endpoint Type: ${endpointType}`);

    const originalRequestBody = await getRequestBody(req);
    if (!originalRequestBody) {
        throw new Error("Request body is missing for content generation.");
    }

    console.log(`Request Body:`, JSON.stringify({
        model: originalRequestBody.model,
        stream: originalRequestBody.stream,
        max_tokens: originalRequestBody.max_tokens,
        temperature: originalRequestBody.temperature,
        messages_count: originalRequestBody.messages?.length || 0
    }, null, 2));
    console.log(`${'='.repeat(60)}`);

    // 确定格式（OpenAI 或 Claude）
    const clientProviderMap = {
        [ENDPOINT_TYPE.OPENAI_CHAT]: 'openai',
        [ENDPOINT_TYPE.CLAUDE_MESSAGE]: 'claude',
    };

    const fromProvider = clientProviderMap[endpointType];
    if (!fromProvider) {
        throw new Error(`Unsupported endpoint type: ${endpointType}`);
    }

    // 提取模型和流信息
    const { model, isStream } = _extractModelAndStreamInfo(req, originalRequestBody, fromProvider);
    if (!model) {
        throw new Error("Could not determine the model from the request.");
    }

    console.log(`\n[Content Generation] Model: ${model}, Stream: ${isStream}, Format: ${fromProvider}`);

    // 如果需要，将 Claude 格式转换为 OpenAI 格式
    let processedRequestBody = originalRequestBody;
    const toProvider = 'openai'; // 始终发送到 OpenAI 上游

    if (fromProvider === 'claude') {
        console.log(`[Request Convert] Converting Claude format to OpenAI format`);
        processedRequestBody = convertData(originalRequestBody, 'request', fromProvider, toProvider);
    } else {
        console.log(`[Request Convert] Already OpenAI format, no conversion needed`);
    }

    // 应用系统提示词（如果配置了）
    processedRequestBody = await _applySystemPromptFromFile(CONFIG, processedRequestBody, toProvider);
    await _manageSystemPrompt(processedRequestBody, toProvider);

    // 记录提示词文本
    const promptText = extractPromptText(processedRequestBody, toProvider);
    await logConversation('input', promptText, CONFIG.PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);

    console.log(`\n=== API REQUEST INFO === (to upstream)`);
    console.log(`Upstream: ${CONFIG.OPENAI_BASE_URL}`);
    console.log(`Model: ${model}`);
    console.log(`Stream: ${isStream}`);
    console.log(`${'='.repeat(60)}\n`);

    // 调用适当的处理器
    if (isStream) {
        await handleStreamRequest(res, service, model, processedRequestBody, fromProvider, toProvider, CONFIG.PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);
    } else {
        await handleUnaryRequest(res, service, model, processedRequestBody, fromProvider, toProvider, CONFIG.PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);
    }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从请求中提取模型和流信息的辅助函数
 * @param {http.IncomingMessage} req - HTTP 请求对象
 * @param {Object} requestBody - 解析后的请求体
 * @param {string} fromProvider - 被调用的端点类型
 * @returns {{model: string, isStream: boolean}} 包含模型名称和流状态的对象
 */
function _extractModelAndStreamInfo(req, requestBody, fromProvider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(fromProvider));
    return strategy.extractModelAndStreamInfo(req, requestBody);
}

/**
 * 从文件应用系统提示词
 */
async function _applySystemPromptFromFile(config, requestBody, toProvider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(toProvider));
    return strategy.applySystemPromptFromFile(config, requestBody);
}

/**
 * 管理系统提示词
 */
export async function _manageSystemPrompt(requestBody, provider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(provider));
    await strategy.manageSystemPrompt(requestBody);
}

/**
 * 从响应中提取文本
 */
export function extractResponseText(response, provider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(provider));
    return strategy.extractResponseText(response);
}

/**
 * 从请求体中提取提示词文本
 */
export function extractPromptText(requestBody, provider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(provider));
    return strategy.extractPromptText(requestBody);
}

/**
 * 从请求体中提取系统提示词
 * 精简版：只支持 OpenAI 和 Claude 格式
 * @param {Object} requestBody - 请求体对象
 * @param {string} provider - 提供商类型（'openai' 或 'claude'）
 * @returns {string} 提取到的系统提示词字符串
 */
export function extractSystemPromptFromRequestBody(requestBody, provider) {
    let incomingSystemText = '';

    switch (provider) {
        case 'openai':
            const openaiSystemMessage = requestBody.messages?.find(m => m.role === 'system');
            if (openaiSystemMessage?.content) {
                incomingSystemText = openaiSystemMessage.content;
            } else if (requestBody.messages?.length > 0) {
                // Fallback to first user message if no system message
                const userMessage = requestBody.messages.find(m => m.role === 'user');
                if (userMessage) {
                    incomingSystemText = userMessage.content;
                }
            }
            break;

        case 'claude':
            if (typeof requestBody.system === 'string') {
                incomingSystemText = requestBody.system;
            } else if (typeof requestBody.system === 'object') {
                incomingSystemText = JSON.stringify(requestBody.system);
            } else if (requestBody.messages?.length > 0) {
                // Fallback to first user message if no system property
                const userMessage = requestBody.messages.find(m => m.role === 'user');
                if (userMessage) {
                    if (Array.isArray(userMessage.content)) {
                        incomingSystemText = userMessage.content.map(block => block.text).join('');
                    } else {
                        incomingSystemText = userMessage.content;
                    }
                }
            }
            break;

        default:
            console.warn(`[System Prompt] Unknown provider: ${provider}`);
            break;
    }

    return incomingSystemText;
}

/**
 * 处理错误响应
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @param {Error} error - 错误对象
 */
export function handleError(res, error) {
    const statusCode = error.response?.status || 500;
    let errorMessage = error.message;
    let suggestions = [];

    // 为不同的错误类型提供详细信息和建议
    switch (statusCode) {
        case 401:
            errorMessage = 'Authentication failed. Please check your credentials.';
            suggestions = [
                'Verify your API key is valid',
                'Check if the API key has the necessary permissions'
            ];
            break;
        case 403:
            errorMessage = 'Access forbidden. Insufficient permissions.';
            suggestions = [
                'Ensure your API key has the necessary permissions',
                'Verify the API endpoint is correct'
            ];
            break;
        case 429:
            errorMessage = 'Too many requests. Rate limit exceeded.';
            suggestions = [
                'Reduce the request frequency',
                'Consider upgrading your API quota if available'
            ];
            break;
        case 500:
        case 502:
        case 503:
        case 504:
            errorMessage = 'Server error occurred. This is usually temporary.';
            suggestions = [
                'Try again in a few minutes',
                'Check the upstream service status'
            ];
            break;
        default:
            if (statusCode >= 400 && statusCode < 500) {
                errorMessage = `Client error (${statusCode}): ${error.message}`;
                suggestions = ['Check your request format and parameters'];
            } else if (statusCode >= 500) {
                errorMessage = `Server error (${statusCode}): ${error.message}`;
                suggestions = ['This is a server-side issue, please try again later'];
            }
    }

    console.error(`\n[Server] Request failed (${statusCode}): ${errorMessage}`);
    if (suggestions.length > 0) {
        console.error('[Server] Suggestions:');
        suggestions.forEach((suggestion, index) => {
            console.error(`  ${index + 1}. ${suggestion}`);
        });
    }
    console.error('[Server] Full error details:', error.stack);

    if (!res.headersSent) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    }

    const errorPayload = {
        error: {
            message: errorMessage,
            code: statusCode,
            suggestions: suggestions,
            details: error.response?.data
        }
    };
    res.end(JSON.stringify(errorPayload));
}
