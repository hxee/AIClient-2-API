import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 模型配置管理器
 * 负责加载和管理统一的模型配置文件 models.config
 */
class ModelsConfigManager {
    constructor() {
        this.config = null;
        this.configPath = path.join(__dirname, '..', 'models.config');
    }

    /**
     * 加载模型配置文件
     * @returns {Promise<Object>} 配置对象
     */
    async loadConfig() {
        try {
            const configContent = await fs.readFile(this.configPath, 'utf-8');
            this.config = JSON.parse(configContent);
            console.log(`[ModelsConfig] Successfully loaded models configuration from ${this.configPath}`);
            return this.config;
        } catch (error) {
            console.error(`[ModelsConfig] Failed to load models.config: ${error.message}`);
            throw new Error(`Failed to load models configuration: ${error.message}`);
        }
    }

    /**
     * 确保配置已加载
     */
    async ensureConfigLoaded() {
        if (!this.config) {
            await this.loadConfig();
        }
    }

    /**
     * 获取指定提供商的所有模型
     * @param {string} provider - 提供商名称 (如 'openai-custom', 'gemini-cli', 'claude-custom' 等)
     * @returns {Promise<Array>} 模型列表
     */
    async getModelsForProvider(provider) {
        await this.ensureConfigLoaded();
        
        const providerConfig = this.config.providers[provider];
        if (!providerConfig) {
            console.warn(`[ModelsConfig] Provider '${provider}' not found in configuration`);
            return [];
        }
        
        return providerConfig.models || [];
    }

    /**
     * 获取所有提供商的模型列表
     * @returns {Promise<Object>} 包含所有提供商及其模型的对象
     */
    async getAllModels() {
        await this.ensureConfigLoaded();
        return this.config.providers;
    }

    /**
     * 检查模型是否存在于指定提供商
     * @param {string} provider - 提供商名称
     * @param {string} modelId - 模型ID
     * @returns {Promise<boolean>} 模型是否存在
     */
    async isModelAvailable(provider, modelId) {
        const models = await this.getModelsForProvider(provider);
        return models.some(model => model.id === modelId);
    }

    /**
     * 获取指定模型的详细信息
     * @param {string} provider - 提供商名称
     * @param {string} modelId - 模型ID
     * @returns {Promise<Object|null>} 模型详细信息，如果未找到则返回 null
     */
    async getModelInfo(provider, modelId) {
        const models = await this.getModelsForProvider(provider);
        return models.find(model => model.id === modelId) || null;
    }

    /**
     * 获取 Gemini 模型列表（包括基础模型和防截断模型）
     * @returns {Promise<Array<string>>} Gemini 模型 ID 列表
     */
    async getGeminiModels() {
        const models = await this.getModelsForProvider('gemini-cli');
        return models.map(model => model.id);
    }

    /**
     * 获取 Gemini 基础模型列表（不包括 anti- 前缀的模型）
     * @returns {Promise<Array<string>>} Gemini 基础模型 ID 列表
     */
    async getGeminiBaseModels() {
        const models = await this.getModelsForProvider('gemini-cli');
        return models
            .filter(model => !model.id.startsWith('anti-'))
            .map(model => model.id);
    }

    /**
     * 获取 Gemini 防截断模型列表
     * @returns {Promise<Array<string>>} Gemini 防截断模型 ID 列表
     */
    async getGeminiAntiTruncationModels() {
        const models = await this.getModelsForProvider('gemini-cli');
        return models
            .filter(model => model.id.startsWith('anti-'))
            .map(model => model.id);
    }

    /**
     * 检查是否为防截断模型
     * @param {string} modelId - 模型ID
     * @returns {Promise<boolean>} 是否为防截断模型
     */
    async isAntiTruncationModel(modelId) {
        const antiModels = await this.getGeminiAntiTruncationModels();
        return antiModels.includes(modelId);
    }

    /**
     * 从防截断模型名中提取基础模型名
     * @param {string} modelId - 防截断模型ID
     * @returns {Promise<string|null>} 基础模型ID，如果不是防截断模型则返回原ID
     */
    async extractBaseModelFromAnti(modelId) {
        const modelInfo = await this.getModelInfo('gemini-cli', modelId);
        if (modelInfo && modelInfo.baseModel) {
            return modelInfo.baseModel;
        }
        // 如果配置中没有 baseModel，尝试移除 anti- 前缀
        if (modelId.startsWith('anti-')) {
            return modelId.substring(5);
        }
        return modelId;
    }

    /**
     * 获取 Claude 模型列表
     * @returns {Promise<Array<string>>} Claude 模型 ID 列表
     */
    async getClaudeModels() {
        const models = await this.getModelsForProvider('claude-custom');
        return models.map(model => model.id);
    }

    /**
     * 获取 Claude Kiro 模型映射
     * @returns {Promise<Object>} 模型ID到Kiro内部ID的映射
     */
    async getClaudeKiroMapping() {
        const models = await this.getModelsForProvider('claude-kiro');
        const mapping = {};
        models.forEach(model => {
            if (model.kiroMapping) {
                mapping[model.id] = model.kiroMapping;
            }
        });
        return mapping;
    }

    /**
     * 获取 Qwen 模型列表
     * @returns {Promise<Array<Object>>} Qwen 模型列表（包含 id 和 name）
     */
    async getQwenModels() {
        const models = await this.getModelsForProvider('qwen-api');
        return models.map(model => ({
            id: model.id,
            name: model.name
        }));
    }

    /**
     * 获取 OpenAI Custom 模型列表
     * @returns {Promise<Array<string>>} OpenAI Custom 模型 ID 列表
     */
    async getOpenAICustomModels() {
        const models = await this.getModelsForProvider('openai-custom');
        return models.map(model => model.id);
    }

    /**
     * 获取 OpenAI Responses 模型列表
     * @returns {Promise<Array<string>>} OpenAI Responses 模型 ID 列表
     */
    async getOpenAIResponsesModels() {
        const models = await this.getModelsForProvider('openai-responses');
        return models.map(model => model.id);
    }

    /**
     * 重新加载配置文件
     * @returns {Promise<Object>} 新的配置对象
     */
    async reloadConfig() {
        console.log('[ModelsConfig] Reloading models configuration...');
        this.config = null;
        return await this.loadConfig();
    }
}

// 创建单例实例
const modelsConfigManager = new ModelsConfigManager();

// 导出单例实例和便捷方法
export { modelsConfigManager };

// 导出便捷方法
export const getModelsForProvider = (provider) => modelsConfigManager.getModelsForProvider(provider);
export const getAllModels = () => modelsConfigManager.getAllModels();
export const isModelAvailable = (provider, modelId) => modelsConfigManager.isModelAvailable(provider, modelId);
export const getModelInfo = (provider, modelId) => modelsConfigManager.getModelInfo(provider, modelId);
export const getGeminiModels = () => modelsConfigManager.getGeminiModels();
export const getGeminiBaseModels = () => modelsConfigManager.getGeminiBaseModels();
export const getGeminiAntiTruncationModels = () => modelsConfigManager.getGeminiAntiTruncationModels();
export const isAntiTruncationModel = (modelId) => modelsConfigManager.isAntiTruncationModel(modelId);
export const extractBaseModelFromAnti = (modelId) => modelsConfigManager.extractBaseModelFromAnti(modelId);
export const getClaudeModels = () => modelsConfigManager.getClaudeModels();
export const getClaudeKiroMapping = () => modelsConfigManager.getClaudeKiroMapping();
export const getQwenModels = () => modelsConfigManager.getQwenModels();
export const getOpenAICustomModels = () => modelsConfigManager.getOpenAICustomModels();
export const getOpenAIResponsesModels = () => modelsConfigManager.getOpenAIResponsesModels();
export const reloadConfig = () => modelsConfigManager.reloadConfig();