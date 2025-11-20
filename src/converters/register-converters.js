/**
 * 转换器注册模块
 * Minimal version: registers OpenAI and Claude converters
 */

import { ConverterFactory } from './ConverterFactory.js';
import { ClaudeConverter } from './strategies/ClaudeConverter.js';
import { OpenAIConverter } from './strategies/OpenAIConverter.js';

/**
 * 注册转换器到工厂
 */
export function registerAllConverters() {
    ConverterFactory.registerConverter('claude', ClaudeConverter);
    ConverterFactory.registerConverter('openai', OpenAIConverter);
}

// 自动注册转换器
registerAllConverters();
