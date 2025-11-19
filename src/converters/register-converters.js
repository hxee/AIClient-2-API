/**
 * 转换器注册模块
 * Minimal version: only registers ClaudeConverter
 */

import { ConverterFactory } from './ConverterFactory.js';
import { ClaudeConverter } from './strategies/ClaudeConverter.js';

const MODEL_PROTOCOL_PREFIX = {
    CLAUDE: 'claude',
    OPENAI: 'openai'
};

/**
 * 注册转换器到工厂
 */
export function registerAllConverters() {
    ConverterFactory.registerConverter(MODEL_PROTOCOL_PREFIX.CLAUDE, ClaudeConverter);
}

// 自动注册转换器
registerAllConverters();
