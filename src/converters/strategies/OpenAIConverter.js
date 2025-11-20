/**
 * OpenAI转换器 - 精简版
 * 只实现 OpenAI -> Claude 的响应转换
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseConverter } from '../BaseConverter.js';

/**
 * OpenAI 转换器类
 * 精简版：只实现必要的转换功能
 */
export class OpenAIConverter extends BaseConverter {
    constructor() {
        super('openai');
    }

    /**
     * 转换请求（精简版：不需要）
     */
    convertRequest(data, targetProtocol) {
        // 精简版不需要从 OpenAI 转换请求到其他格式
        return data;
    }

    /**
     * 转换响应
     */
    convertResponse(data, targetProtocol, model) {
        switch (targetProtocol) {
            case 'claude':
                return this.toClaudeResponse(data, model);
            case 'openai':
                // OpenAI -> OpenAI，直接返回
                return data;
            default:
                throw new Error(`Unsupported target protocol: ${targetProtocol}`);
        }
    }

    /**
     * 转换流式响应块
     */
    convertStreamChunk(chunk, targetProtocol, model) {
        switch (targetProtocol) {
            case 'claude':
                return this.toClaudeStreamChunk(chunk, model);
            case 'openai':
                // OpenAI -> OpenAI，直接返回
                return chunk;
            default:
                throw new Error(`Unsupported target protocol: ${targetProtocol}`);
        }
    }

    /**
     * 转换模型列表
     */
    convertModelList(data, targetProtocol) {
        return data;
    }

    // =========================================================================
    // OpenAI -> Claude 转换
    // =========================================================================

    /**
     * OpenAI响应 -> Claude响应
     */
    toClaudeResponse(openaiResponse, model) {
        if (!openaiResponse || !openaiResponse.choices || openaiResponse.choices.length === 0) {
            return {
                id: `msg_${uuidv4().replace(/-/g, '')}`,
                type: "message",
                role: "assistant",
                content: [],
                model: model,
                stop_reason: "end_turn",
                usage: {
                    input_tokens: 0,
                    output_tokens: 0
                }
            };
        }

        const choice = openaiResponse.choices[0];
        const message = choice.message || {};
        const content = [];

        // 处理文本内容
        if (message.content) {
            content.push({
                type: "text",
                text: message.content
            });
        }

        // 处理工具调用
        if (message.tool_calls && message.tool_calls.length > 0) {
            for (const toolCall of message.tool_calls) {
                content.push({
                    type: "tool_use",
                    id: toolCall.id,
                    name: toolCall.function?.name || '',
                    input: JSON.parse(toolCall.function?.arguments || '{}')
                });
            }
        }

        // 映射 finish_reason
        let stopReason = "end_turn";
        if (choice.finish_reason === 'stop') {
            stopReason = "end_turn";
        } else if (choice.finish_reason === 'length') {
            stopReason = "max_tokens";
        } else if (choice.finish_reason === 'tool_calls') {
            stopReason = "tool_use";
        }

        return {
            id: `msg_${uuidv4().replace(/-/g, '')}`,
            type: "message",
            role: "assistant",
            content: content,
            model: model || openaiResponse.model,
            stop_reason: stopReason,
            stop_sequence: null,
            usage: {
                input_tokens: openaiResponse.usage?.prompt_tokens || 0,
                output_tokens: openaiResponse.usage?.completion_tokens || 0
            }
        };
    }

    /**
     * OpenAI流式响应 -> Claude流式响应
     */
    toClaudeStreamChunk(openaiChunk, model) {
        if (!openaiChunk || !openaiChunk.choices || openaiChunk.choices.length === 0) {
            return null;
        }

        const choice = openaiChunk.choices[0];
        const delta = choice.delta || {};

        // message_start 事件（第一个块）
        if (delta.role === 'assistant') {
            return {
                type: "message_start",
                message: {
                    id: `msg_${uuidv4().replace(/-/g, '')}`,
                    type: "message",
                    role: "assistant",
                    content: [],
                    model: model || openaiChunk.model,
                    stop_reason: null,
                    usage: {
                        input_tokens: 0,
                        output_tokens: 0
                    }
                }
            };
        }

        // content_block_delta 事件（文本增量）
        if (delta.content) {
            return {
                type: "content_block_delta",
                index: 0,
                delta: {
                    type: "text_delta",
                    text: delta.content
                }
            };
        }

        // content_block_delta 事件（推理内容）
        if (delta.reasoning_content) {
            return {
                type: "content_block_delta",
                index: 0,
                delta: {
                    type: "thinking_delta",
                    thinking: delta.reasoning_content
                }
            };
        }

        // 处理工具调用
        if (delta.tool_calls && delta.tool_calls.length > 0) {
            const toolCall = delta.tool_calls[0];

            // 工具调用开始
            if (toolCall.function?.name) {
                return {
                    type: "content_block_start",
                    index: toolCall.index || 0,
                    content_block: {
                        type: "tool_use",
                        id: toolCall.id,
                        name: toolCall.function.name
                    }
                };
            }

            // 工具调用参数增量
            if (toolCall.function?.arguments) {
                return {
                    type: "content_block_delta",
                    index: toolCall.index || 0,
                    delta: {
                        type: "input_json_delta",
                        partial_json: toolCall.function.arguments
                    }
                };
            }
        }

        // message_delta 事件（结束）
        if (choice.finish_reason) {
            let stopReason = "end_turn";
            if (choice.finish_reason === 'stop') {
                stopReason = "end_turn";
            } else if (choice.finish_reason === 'length') {
                stopReason = "max_tokens";
            } else if (choice.finish_reason === 'tool_calls') {
                stopReason = "tool_use";
            }

            return {
                type: "message_delta",
                delta: {
                    stop_reason: stopReason
                },
                usage: openaiChunk.usage ? {
                    input_tokens: openaiChunk.usage.prompt_tokens || 0,
                    output_tokens: openaiChunk.usage.completion_tokens || 0
                } : undefined
            };
        }

        return null;
    }
}

export default OpenAIConverter;
