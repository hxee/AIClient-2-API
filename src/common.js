import { promises as fs } from 'fs';
import * as path from 'path';
import * as http from 'http'; // Add http for IncomingMessage and ServerResponse types
import * as crypto from 'crypto'; // Import crypto for MD5 hashing
import { ApiServiceAdapter } from './adapter.js'; // Import ApiServiceAdapter
import { convertData, getOpenAIStreamChunkStop, getOpenAIResponsesStreamChunkBegin, getOpenAIResponsesStreamChunkEnd } from './convert.js';
import { ProviderStrategyFactory } from './provider-strategies.js';
import { getApiService } from './service-manager.js';

export const API_ACTIONS = {
    GENERATE_CONTENT: 'generateContent',
    STREAM_GENERATE_CONTENT: 'streamGenerateContent',
};

export const MODEL_PROTOCOL_PREFIX = {
    // Model provider constants
    GEMINI: 'gemini',
    OPENAI: 'openai',
    OPENAI_RESPONSES: 'openaiResponses',
    CLAUDE: 'claude',
    OLLAMA: 'ollama',
}

export const MODEL_PROVIDER = {
    // Model provider constants
    GEMINI_CLI: 'gemini-cli-oauth',
    OPENAI_CUSTOM: 'openai-custom',
    OPENAI_CUSTOM_RESPONSES: 'openaiResponses-custom',
    CLAUDE_CUSTOM: 'claude-custom',
    KIRO_API: 'claude-kiro-oauth',
    QWEN_API: 'openai-qwen-oauth',
}

/**
 * Generate display prefix for a provider type
 * Supports compound provider names like "openai-custom-anyrouter"
 * @param {string} providerType - Provider type key (e.g., "openai-custom-anyrouter")
 * @returns {string} Display prefix (e.g., "[OpenAI-AnyRouter]")
 */
export function getProviderDisplayPrefix(providerType) {
    if (!providerType) return '';
    
    // Parse provider type: {protocol}-{source}[-{vendor}]
    const parts = providerType.split('-');
    
    if (parts.length === 0) return '';
    
    // Capitalize first letter of each part
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
    
    // Handle known provider type patterns
    if (parts.length === 2) {
        // e.g., "openai-custom" -> "[OpenAI]"
        // e.g., "gemini-cli" -> "[Gemini CLI]"
        const protocol = capitalize(parts[0]);
        const source = parts[1] === 'oauth' ? 'CLI' : capitalize(parts[1]);
        
        // Special handling for standard providers
        if (parts[1] === 'custom') {
            return `[${protocol}]`;
        }
        return `[${protocol} ${source}]`;
    } else if (parts.length >= 3) {
        // e.g., "openai-custom-anyrouter" -> "[OpenAI-AnyRouter]"
        // e.g., "claude-kiro-oauth" -> "[Claude-Kiro]"
        const protocol = capitalize(parts[0]);
        const vendor = parts.slice(2).map(capitalize).join('-');
        return `[${protocol}-${vendor}]`;
    } else {
        // Fallback for single part
        return `[${capitalize(parts[0])}]`;
    }
}

/**
 * Model name prefix mapping for different providers
 * These prefixes are added to model names in the list for user visibility
 * but are removed before sending to actual providers
 */
export const MODEL_PREFIX_MAP = {
    [MODEL_PROVIDER.KIRO_API]: '[Kiro]',
    [MODEL_PROVIDER.CLAUDE_CUSTOM]: '[Claude]',
    [MODEL_PROVIDER.GEMINI_CLI]: '[Gemini CLI]',
    [MODEL_PROVIDER.OPENAI_CUSTOM]: '[OpenAI]',
    [MODEL_PROVIDER.QWEN_API]: '[Qwen CLI]',
    [MODEL_PROVIDER.OPENAI_CUSTOM_RESPONSES]: '[OpenAI Responses]',
}

// Removed: PROVIDER_ALIAS and ALIAS_TO_PROVIDER_TYPES (not needed in minimal version)

/**
 * Extracts the protocol prefix from a given model provider string.
 * This is used to determine if two providers belong to the same underlying protocol (e.g., gemini, openai, claude).
 * @param {string} provider - The model provider string (e.g., 'gemini-cli', 'openai-custom').
 * @returns {string} The protocol prefix (e.g., 'gemini', 'openai', 'claude').
 */
export function getProtocolPrefix(provider) {
    const hyphenIndex = provider.indexOf('-');
    if (hyphenIndex !== -1) {
        const prefix = provider.substring(0, hyphenIndex);
        return prefix;
    }
    return provider; // Return original if no hyphen is found
}

/**
 * Adds provider prefix to model name for display purposes
 * @param {string} modelName - Original model name
 * @param {string} provider - Provider type
 * @returns {string} Model name with prefix
 */
export function addModelPrefix(modelName, provider, options = {}) {
    if (!modelName) return modelName;
    
    // Don't add prefix if already exists
    if (/^\[.*?\]\s+/.test(modelName)) {
        return modelName;
    }
    
    // Use alias from PROVIDER_ALIAS directly, without adding vendorName
    const alias = PROVIDER_ALIAS[provider];
    
    let prefixText = alias || '';
    if (!prefixText) {
        const dynamic = getProviderDisplayPrefix(provider);
        if (dynamic && dynamic !== '[]') {
            prefixText = dynamic.replace(/^\[|\]$/g, '').toLowerCase();
        } else {
            prefixText = provider;
        }
    }
    
    return `[${prefixText}] ${modelName}`;
}

/**
 * Removes provider prefix from model name before sending to provider
 * @param {string} modelName - Model name with possible prefix
 * @returns {string} Clean model name without prefix
 */
export function removeModelPrefix(modelName) {
    if (!modelName) {
        return modelName;
    }
    
    // Remove any prefix pattern like [Kiro], [Gemini], etc.
    const prefixPattern = /^\[.*?\]\s+/;
    return modelName.replace(prefixPattern, '');
}

/**
 * Extracts provider type from prefixed model name
 * @param {string} modelName - Model name with possible prefix
 * @returns {string|null} Provider type or null if no prefix found
 */
export function getProviderFromPrefix(modelName) {
    if (!modelName) {
        return null;
    }
    
    const match = modelName.match(/^\[(.*?)\]/);
    if (!match) {
        return null;
    }
    
    const prefixText = `[${match[1]}]`;
    
    // Find provider by prefix
    for (const [provider, prefix] of Object.entries(MODEL_PREFIX_MAP)) {
        if (prefix === prefixText) {
            return provider;
        }
    }
    
    return null;
}

/**
 * Adds provider prefix to array of models (works with any format)
 * @param {Array} models - Array of model objects
 * @param {string} provider - Provider type
 * @param {string} format - Format type ('openai', 'gemini', 'ollama')
 * @returns {Array} Models with prefixed names
 */
export function addPrefixToModels(models, provider, format = 'openai', providerInfo = {}) {
    if (!Array.isArray(models)) return models;
    
    const prefixOptions = {
        vendorName: providerInfo.vendorName,
        providerUuid: providerInfo.uuid
    };
    
    return models.map(model => {
        if (format === 'openai') {
            return { ...model, id: addModelPrefix(model.id, provider, prefixOptions) };
        } else if (format === 'ollama') {
            return {
                ...model,
                name: addModelPrefix(model.name, provider, prefixOptions),
                model: addModelPrefix(model.model || model.name, provider, prefixOptions)
            };
        } else {
            // gemini/claude format
            return {
                ...model,
                name: addModelPrefix(model.name, provider, prefixOptions),
                displayName: model.displayName ? addModelPrefix(model.displayName, provider, prefixOptions) : undefined
            };
        }
    });
}

/**
 * Extract vendor name from model prefix
 * @param {string} modelName - Model name with prefix like "[OpenAI-AnyRouter] model"
 * @returns {{protocol: string|null, vendor: string|null, providerUuid: string|null}} Protocol, vendor and provider uuid
 */
// Removed: extractPrefixInfo (not needed in minimal version - no provider prefixes)

// Removed: findMatchingProviderKey (not needed in minimal version - no provider pools)

// Removed: getProviderByModelName (not needed in minimal version - direct OpenAI service)

// Minimal version: Only OpenAI and Claude endpoints
export const ENDPOINT_TYPE = {
    OPENAI_CHAT: 'openai-chat',
    CLAUDE_MESSAGE: 'claude-message',
    OPENAI_MODEL_LIST: 'openai-model-list',
};

export const FETCH_SYSTEM_PROMPT_FILE = path.join(process.cwd(), 'fetch_system_prompt.txt');
export const INPUT_SYSTEM_PROMPT_FILE = path.join(process.cwd(), 'input_system_prompt.txt');

export function formatExpiryTime(expiryTimestamp) {
    if (!expiryTimestamp || typeof expiryTimestamp !== 'number') return "No expiry date available";
    const diffMs = expiryTimestamp - Date.now();
    if (diffMs <= 0) return "Token has expired";
    let totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

/**
 * Reads the entire request body from an HTTP request.
 * @param {http.IncomingMessage} req - The HTTP request object.
 * @returns {Promise<Object>} A promise that resolves with the parsed JSON request body.
 * @throws {Error} If the request body is not valid JSON.
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

export async function logConversation(type, content, logMode, logFilename) {
    if (logMode === 'none') return;
    if (!content) return;

    const timestamp = new Date().toLocaleString();
    const logEntry = `${timestamp} [${type.toUpperCase()}]:\n${content}\n--------------------------------------\n`;

    if (logMode === 'console') {
        console.log(logEntry);
    } else if (logMode === 'file') {
        try {
            // Append to the file
            await fs.appendFile(logFilename, logEntry);
        } catch (err) {
            console.error(`[Error] Failed to write conversation log to ${logFilename}:`, err);
        }
    }
}

/**
 * Checks if the request is authorized based on API key.
 * @param {http.IncomingMessage} req - The HTTP request object.
 * @param {URL} requestUrl - The parsed URL object.
 * @param {string} REQUIRED_API_KEY - The API key required for authorization.
 * @returns {boolean} True if authorized, false otherwise.
 */
export function isAuthorized(req, requestUrl, REQUIRED_API_KEY) {
    const authHeader = req.headers['authorization'];
    const queryKey = requestUrl.searchParams.get('key');
    const googApiKey = req.headers['x-goog-api-key'];
    const claudeApiKey = req.headers['x-api-key']; // Claude-specific header

    // Check for Bearer token in Authorization header (OpenAI style)
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === REQUIRED_API_KEY) {
            return true;
        }
    }

    // Check for API key in URL query parameter (Gemini style)
    if (queryKey === REQUIRED_API_KEY) {
        return true;
    }

    // Check for API key in x-goog-api-key header (Gemini style)
    if (googApiKey === REQUIRED_API_KEY) {
        return true;
    }

    // Check for API key in x-api-key header (Claude style)
    if (claudeApiKey === REQUIRED_API_KEY) {
        return true;
    }

    console.log(`[Auth] Unauthorized request denied. Bearer: "${authHeader ? 'present' : 'N/A'}", Query Key: "${queryKey}", x-goog-api-key: "${googApiKey}", x-api-key: "${claudeApiKey}"`);
    return false;
}

/**
 * Handles the common logic for sending API responses (unary and stream).
 * This includes writing response headers, logging conversation, and logging auth token expiry.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {Object} responsePayload - The actual response payload (string for unary, object for stream chunks).
 * @param {boolean} isStream - Whether the response is a stream.
 */
export async function handleUnifiedResponse(res, responsePayload, isStream) {
    if (isStream) {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Transfer-Encoding": "chunked" });
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
    }

    if (isStream) {
        // Stream chunks are handled by the calling function that iterates the stream
    } else {
        res.end(responsePayload);
    }
}

export async function handleStreamRequest(res, service, model, requestBody, fromProvider, toProvider, PROMPT_LOG_MODE, PROMPT_LOG_FILENAME) {
    let fullResponseText = '';
    let fullResponseJson = '';
    let fullOldResponseJson = '';
    let responseClosed = false;

    await handleUnifiedResponse(res, '', true);

    // fs.writeFile('request'+Date.now()+'.json', JSON.stringify(requestBody));
    // The service returns a stream in its native format (toProvider).
    const needsConversion = getProtocolPrefix(fromProvider) !== getProtocolPrefix(toProvider);
    requestBody.model = model;
    const nativeStream = await service.generateContentStream(model, requestBody);
    const addEvent = getProtocolPrefix(fromProvider) === MODEL_PROTOCOL_PREFIX.CLAUDE || getProtocolPrefix(fromProvider) === MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES;
    const openStop = getProtocolPrefix(fromProvider) === MODEL_PROTOCOL_PREFIX.OPENAI ;

    try {
        for await (const nativeChunk of nativeStream) {
            // Extract text for logging purposes
            const chunkText = extractResponseText(nativeChunk, toProvider);
            if (chunkText && !Array.isArray(chunkText)) {
                fullResponseText += chunkText;
                // 使用非阻塞的 stdout 写入来实时显示流式内容
                if (process.stdout.isTTY) {
                    process.stdout.write(chunkText);
                }
            }

            // Convert the complete chunk object to the client's format (fromProvider), if necessary.
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
                    // fullOldResponseJson += chunk.type+"\n";
                    // fullResponseJson += chunk.type+"\n";
                    res.write(`event: ${chunk.type}\n`);
                    // 使用 process.stdout.write 代替 console.log 实现非阻塞输出
                    if (process.env.DEBUG_STREAM) {
                        process.stdout.write(`event: ${chunk.type}\n`);
                    }
                }

                // fullOldResponseJson += JSON.stringify(chunk)+"\n";
                // fullResponseJson += JSON.stringify(chunk)+"\n\n";
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                // 使用 process.stdout.write 代替 console.log 实现非阻塞输出
                if (process.env.DEBUG_STREAM) {
                    process.stdout.write(`data: ${JSON.stringify(chunk)}\n`);
                }
            }
        }
        if (openStop && needsConversion) {
            res.write(`data: ${JSON.stringify(getOpenAIStreamChunkStop(model))}\n\n`);
            // 使用 process.stdout.write 代替 console.log 实现非阻塞输出
            if (process.env.DEBUG_STREAM) {
                process.stdout.write(`data: ${JSON.stringify(getOpenAIStreamChunkStop(model))}\n`);
            }
        }

    }  catch (error) {
        // 使用 process.stderr.write 代替 console.error 实现非阻塞错误输出
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
        // 在流结束后输出换行符
        if (process.stdout.isTTY && fullResponseText) {
            process.stdout.write('\n');
        }
        await logConversation('output', fullResponseText, PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);
        // fs.writeFile('oldResponseChunk'+Date.now()+'.json', fullOldResponseJson);
        // fs.writeFile('responseChunk'+Date.now()+'.json', fullResponseJson);
    }
}

export async function handleUnaryRequest(res, service, model, requestBody, fromProvider, toProvider, PROMPT_LOG_MODE, PROMPT_LOG_FILENAME) {
    try{
        setImmediate(() => {
            process.stdout.write(`[Unary Request] Starting content generation - fromProvider: ${fromProvider}, toProvider: ${toProvider}, model: ${model}\n`);
        });
        
        // The service returns the response in its native format (toProvider).
        const needsConversion = getProtocolPrefix(fromProvider) !== getProtocolPrefix(toProvider);
        requestBody.model = model;
        // fs.writeFile('oldRequest'+Date.now()+'.json', JSON.stringify(requestBody));
        
        setImmediate(() => {
            process.stdout.write(`[Unary Request] Calling service.generateContent...\n`);
        });
        const nativeResponse = await service.generateContent(model, requestBody);
        setImmediate(() => {
            process.stdout.write(`[Unary Request] ✓ Received response from service\n`);
        });
        
        const responseText = extractResponseText(nativeResponse, toProvider);

        // Convert the response back to the client's format (fromProvider), if necessary.
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
        // fs.writeFile('oldResponse'+Date.now()+'.json', JSON.stringify(clientResponse));
    } catch (error) {
        setImmediate(() => {
            process.stderr.write(`\n[Server] Error during unary processing: ${error.stack}\n`);
        });

        // 返回错误响应给客户端
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

/**
 * Handles requests for listing available models. It fetches models from the
 * service, transforms them to the format expected by the client (OpenAI, Claude, etc.),
 * and sends the JSON response.
 * @param {http.IncomingMessage} req The HTTP request object.
 * @param {http.ServerResponse} res The HTTP response object.
 * @param {ApiServiceAdapter} service The API service adapter.
 * @param {string} endpointType The type of endpoint being called (e.g., OPENAI_MODEL_LIST).
 * @param {Object} CONFIG - The server configuration object.
 */
/**
 * Minimal version: Directly fetch models from upstream OpenAI API
 */
export async function handleModelListRequest(req, res, service, endpointType, CONFIG) {
    const startTime = Date.now();

    try {
        // Log request info from client
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

        // Only support OpenAI format in minimal version
        if (endpointType !== 'openai-model-list') {
            throw new Error(`Unsupported endpoint type: ${endpointType}. Minimal version only supports openai-model-list`);
        }

        // Log API request info to upstream
        console.log(`\n=== API REQUEST INFO === (to upstream)`);
        console.log(`Upstream: ${CONFIG.OPENAI_BASE_URL}`);
        console.log(`Endpoint: GET /models`);
        console.log(`API Key: ${CONFIG.OPENAI_API_KEY ? `${CONFIG.OPENAI_API_KEY.substring(0, 10)}...` : 'Not configured'}`);
        console.log(`${'='.repeat(60)}\n`);

        // Fetch models from upstream OpenAI API
        console.log(`[ModelList] Fetching models from upstream...`);
        const modelsResponse = await service.listModels();

        const elapsed = Date.now() - startTime;
        const modelCount = modelsResponse.data?.length || 0;

        console.log(`[ModelList] ✓ Fetched ${modelCount} models from upstream (${elapsed}ms)`);
        console.log(`[ModelList] Sending response to client\n`);

        // Return the response from upstream directly
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
 * Handles requests for content generation (both unary and streaming).
 * Minimal version: Direct OpenAI proxy with optional Claude format conversion.
 *
 * @param {http.IncomingMessage} req The HTTP request object.
 * @param {http.ServerResponse} res The HTTP response object.
 * @param {ApiServiceAdapter} service The API service adapter (OpenAI).
 * @param {string} endpointType The type of endpoint (openai-chat or claude-message).
 * @param {Object} CONFIG - The server configuration object.
 * @param {string} PROMPT_LOG_FILENAME - The prompt log filename.
 */
export async function handleContentGenerationRequest(req, res, service, endpointType, CONFIG, PROMPT_LOG_FILENAME) {
    const startTime = Date.now();

    // Log request info from client
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

    // Log request body info
    console.log(`Request Body:`, JSON.stringify({
        model: originalRequestBody.model,
        stream: originalRequestBody.stream,
        max_tokens: originalRequestBody.max_tokens,
        temperature: originalRequestBody.temperature,
        messages_count: originalRequestBody.messages?.length || 0
    }, null, 2));
    console.log(`${'='.repeat(60)}`);

    // Determine format (OpenAI or Claude)
    const clientProviderMap = {
        [ENDPOINT_TYPE.OPENAI_CHAT]: MODEL_PROTOCOL_PREFIX.OPENAI,
        [ENDPOINT_TYPE.CLAUDE_MESSAGE]: MODEL_PROTOCOL_PREFIX.CLAUDE,
    };

    const fromProvider = clientProviderMap[endpointType];
    if (!fromProvider) {
        throw new Error(`Unsupported endpoint type: ${endpointType}`);
    }

    // Extract model and stream info
    const { model, isStream } = _extractModelAndStreamInfo(req, originalRequestBody, fromProvider);
    if (!model) {
        throw new Error("Could not determine the model from the request.");
    }

    console.log(`\n[Content Generation] Model: ${model}, Stream: ${isStream}, Format: ${fromProvider}`);

    // Convert Claude format to OpenAI format if needed
    let processedRequestBody = originalRequestBody;
    const toProvider = MODEL_PROTOCOL_PREFIX.OPENAI; // Always send to OpenAI upstream

    if (fromProvider === MODEL_PROTOCOL_PREFIX.CLAUDE) {
        console.log(`[Request Convert] Converting Claude format to OpenAI format`);
        processedRequestBody = convertData(originalRequestBody, 'request', fromProvider, toProvider);
    } else {
        console.log(`[Request Convert] Already OpenAI format, no conversion needed`);
    }

    // Apply system prompt if configured
    processedRequestBody = await _applySystemPromptFromFile(CONFIG, processedRequestBody, toProvider);
    await _manageSystemPrompt(processedRequestBody, toProvider);

    // Log prompt text
    const promptText = extractPromptText(processedRequestBody, toProvider);
    await logConversation('input', promptText, CONFIG.PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);

    // Log upstream request info
    console.log(`\n=== API REQUEST INFO === (to upstream)`);
    console.log(`Upstream: ${CONFIG.OPENAI_BASE_URL}`);
    console.log(`Model: ${model}`);
    console.log(`Stream: ${isStream}`);
    console.log(`${'='.repeat(60)}\n`);

    // Call appropriate handler (use passed-in service directly)
    if (isStream) {
        await handleStreamRequest(res, service, model, processedRequestBody, fromProvider, toProvider, CONFIG.PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);
    } else {
        await handleUnaryRequest(res, service, model, processedRequestBody, fromProvider, toProvider, CONFIG.PROMPT_LOG_MODE, PROMPT_LOG_FILENAME);
    }
}

/**
 * Helper function to extract model and stream information from the request.
 * @param {http.IncomingMessage} req The HTTP request object.
 * @param {Object} requestBody The parsed request body.
 * @param {string} fromProvider The type of endpoint being called.
 * @returns {{model: string, isStream: boolean}} An object containing the model name and stream status.
 */
function _extractModelAndStreamInfo(req, requestBody, fromProvider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(fromProvider));
    return strategy.extractModelAndStreamInfo(req, requestBody);
}

async function _applySystemPromptFromFile(config, requestBody, toProvider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(toProvider));
    return strategy.applySystemPromptFromFile(config, requestBody);
}

export async function _manageSystemPrompt(requestBody, provider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(provider));
    await strategy.manageSystemPrompt(requestBody);
}

// Helper functions for content extraction and conversion (from convert.js, but needed here)
export function extractResponseText(response, provider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(provider));
    return strategy.extractResponseText(response);
}

export function extractPromptText(requestBody, provider) {
    const strategy = ProviderStrategyFactory.getStrategy(getProtocolPrefix(provider));
    return strategy.extractPromptText(requestBody);
}

export function handleError(res, error) {
    const statusCode = error.response?.status || 500;
    let errorMessage = error.message;
    let suggestions = [];

    // Provide detailed information and suggestions for different error types
    switch (statusCode) {
        case 401:
            errorMessage = 'Authentication failed. Please check your credentials.';
            suggestions = [
                'Verify your OAuth credentials are valid',
                'Try re-authenticating by deleting the credentials file',
                'Check if your Google Cloud project has the necessary permissions'
            ];
            break;
        case 403:
            errorMessage = 'Access forbidden. Insufficient permissions.';
            suggestions = [
                'Ensure your Google Cloud project has the Code Assist API enabled',
                'Check if your account has the necessary permissions',
                'Verify the project ID is correct'
            ];
            break;
        case 429:
            errorMessage = 'Too many requests. Rate limit exceeded.';
            suggestions = [
                'The request has been automatically retried with exponential backoff',
                'If the issue persists, try reducing the request frequency',
                'Consider upgrading your API quota if available'
            ];
            break;
        case 500:
        case 502:
        case 503:
        case 504:
            errorMessage = 'Server error occurred. This is usually temporary.';
            suggestions = [
                'The request has been automatically retried',
                'If the issue persists, try again in a few minutes',
                'Check Google Cloud status page for service outages'
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

/**
 * 从请求体中提取系统提示词。
 * @param {Object} requestBody - 请求体对象。
 * @param {string} provider - 提供商类型（'openai', 'gemini', 'claude'）。
 * @returns {string} 提取到的系统提示词字符串。
 */
export function extractSystemPromptFromRequestBody(requestBody, provider) {
    let incomingSystemText = '';
    switch (provider) {
        case MODEL_PROTOCOL_PREFIX.OPENAI:
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
        case MODEL_PROTOCOL_PREFIX.GEMINI:
            const geminiSystemInstruction = requestBody.system_instruction || requestBody.systemInstruction;
            if (geminiSystemInstruction?.parts) {
                incomingSystemText = geminiSystemInstruction.parts
                    .filter(p => p?.text)
                    .map(p => p.text)
                    .join('\n');
            } else if (requestBody.contents?.length > 0) {
                // Fallback to first user content if no system instruction
                const userContent = requestBody.contents[0];
                if (userContent?.parts) {
                    incomingSystemText = userContent.parts
                        .filter(p => p?.text)
                        .map(p => p.text)
                        .join('\n');
                }
            }
            break;
        case MODEL_PROTOCOL_PREFIX.CLAUDE:
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
 * Generates an MD5 hash for a given object by first converting it to a JSON string.
 * @param {object} obj - The object to hash.
 * @returns {string} The MD5 hash of the object's JSON string representation.
 */
export function getMD5Hash(obj) {
    const jsonString = JSON.stringify(obj);
    return crypto.createHash('md5').update(jsonString).digest('hex');
}


