// 模型管理模块

import { showToast, getProviderDisplayName } from './utils.js';

/**
 * 模型管理类
 */
class ModelsManager {
    constructor() {
        this.modelsData = null;
        this.expandedProviders = new Set(); // 记录展开的提供商
        this.initEventListeners();
    }

    /**
     * 初始化事件监听器
     */
    initEventListeners() {
        // 等待 DOM 加载完成后初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    /**
     * 初始化模型管理界面
     */
    async init() {
        // 当切换到模型管理页面时加载数据
        document.addEventListener('click', async (e) => {
            const navItem = e.target.closest('[data-section="models"]');
            if (navItem) {
                await this.loadModels();
            }
        });
    }

    /**
     * 加载模型数据
     */
    async loadModels() {
        try {
            const response = await window.apiClient.get('/models');
            this.modelsData = response;
            this.renderModelsUI();
        } catch (error) {
            console.error('Failed to load models:', error);
            showToast('加载模型数据失败: ' + error.message, 'error');
        }
    }

    /**
     * 渲染模型管理UI
     */
    renderModelsUI() {
        const container = document.getElementById('modelsList');
        if (!container || !this.modelsData) return;

        const providers = this.modelsData.providers || {};
        
        // 先 CLI（按字母顺序），再其他（按字母顺序）
        const providerDisplayOrder = [
            'openai-custom',     // OpenAI Chat
            'openai-responses',   // OpenAI Responses
            'claude-custom',    // Claude
            'gemini-cli',        // Gemini CLI
            'qwen-api',          // Qwen CLI
            'claude-kiro'       // Kiro
        ];
        
        // 获取所有提供商并按指定顺序排序
        const allProviderKeys = Object.keys(providers);
        const sortedProviderKeys = providerDisplayOrder.filter(key => allProviderKeys.includes(key))
            .concat(allProviderKeys.filter(key => !providerDisplayOrder.includes(key)));
        
        let html = '<div class="models-provider-list">';
        
        for (const providerKey of sortedProviderKeys) {
            const providerData = providers[providerKey];
            const models = providerData.models || [];
            const description = providerData.description || '';
            
            html += `
                <div class="provider-card" data-provider="${providerKey}">
                    <div class="provider-card-header" onclick="window.modelsManager.toggleProvider('${providerKey}')">
                        <div class="provider-info">
                            <h3>${getProviderDisplayName(providerKey)}</h3>
                            <p class="provider-description">${description}</p>
                        </div>
                        <div class="provider-actions">
                            <span class="model-count">${models.length} 个模型</span>
                            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.modelsManager.showAddModelModal('${providerKey}')">
                                <i class="fas fa-plus"></i> 添加模型
                            </button>
                        </div>
                    </div>
                    <div class="provider-models-list" id="models-${providerKey}" style="display: ${this.expandedProviders.has(providerKey) ? 'block' : 'none'};">
                        ${this.renderModelsList(providerKey, models)}
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
    }

    /**
     * 渲染模型列表 - 垂直布局
     */
    renderModelsList(providerKey, models) {
        if (!models || models.length === 0) {
            return '<p class="no-models">暂无模型</p>';
        }

        let html = '<div class="models-vertical-list">';
        
        for (const model of models) {
            // 显示额外属性（如 kiroMapping）
            let extraInfo = '';
            if (model.kiroMapping) {
                extraInfo = `<div class="model-extra-info"><span class="extra-label">Kiro映射:</span> <span class="extra-value">${model.kiroMapping}</span></div>`;
            }
            
            html += `
                <div class="model-item-vertical" data-model-id="${model.id}" data-provider="${providerKey}">
                    <div class="model-info">
                        <h4>${model.name || model.id}</h4>
                        <div class="model-id">ID: ${model.id}</div>
                        ${model.description ? `<div class="model-description">${model.description}</div>` : ''}
                        ${extraInfo}
                    </div>
                    <div class="model-actions">
                        <button class="btn btn-sm btn-outline" onclick="window.modelsManager.editModel('${providerKey}', '${model.id}')">
                            <i class="fas fa-edit"></i> 编辑
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="window.modelsManager.deleteModel('${providerKey}', '${model.id}')">
                            <i class="fas fa-trash"></i> 删除
                        </button>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }

    /**
     * 切换提供商展开/收起状态
     */
    toggleProvider(providerKey) {
        if (this.expandedProviders.has(providerKey)) {
            this.expandedProviders.delete(providerKey);
        } else {
            this.expandedProviders.add(providerKey);
        }
        
        const modelsList = document.getElementById(`models-${providerKey}`);
        if (modelsList) {
            modelsList.style.display = this.expandedProviders.has(providerKey) ? 'block' : 'none';
        }
    }

    /**
     * 关闭所有现有的模态框
     */
    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => modal.remove());
    }

    /**
     * 显示添加模型的模态框
     */
    showAddModelModal(providerKey) {
        // 先关闭所有现有的模态框
        this.closeAllModals();
        
        // 检查是否是 claude-kiro，如果是则显示 kiroMapping 字段
        const isKiro = providerKey === 'claude-kiro';
        
        const modal = document.createElement('div');
        modal.className = 'provider-modal';
        modal.innerHTML = `
            <div class="provider-modal-content" style="max-width: 600px;">
                <div class="provider-modal-header">
                    <h3><i class="fas fa-plus"></i> 添加模型</h3>
                    <button class="modal-close" onclick="this.closest('.provider-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="provider-modal-body">
                    <div class="form-group">
                        <label for="modelId">模型 ID *</label>
                        <input type="text" id="modelId" class="form-control" placeholder="例如: gpt-4" required>
                    </div>
                    <div class="form-group">
                        <label for="modelName">模型名称</label>
                        <input type="text" id="modelName" class="form-control" placeholder="例如: GPT-4">
                    </div>
                    <div class="form-group">
                        <label for="modelDescription">描述</label>
                        <textarea id="modelDescription" class="form-control" rows="2" placeholder="模型描述"></textarea>
                    </div>
                    ${isKiro ? `
                    <div class="form-group">
                        <label for="kiroMapping">Kiro 映射</label>
                        <input type="text" id="kiroMapping" class="form-control" placeholder="例如: CLAUDE_SONNET_4_5_20250929_V1_0">
                    </div>
                    ` : ''}
                </div>
                <div class="provider-modal-footer" style="padding: 1.5rem 2rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 1rem; background: var(--bg-secondary);">
                    <button class="btn btn-secondary" onclick="this.closest('.provider-modal').remove()">取消</button>
                    <button class="btn btn-success" id="saveModelBtn">
                        <i class="fas fa-save"></i> 保存
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        // 阻止模态框内容区域的点击事件冒泡
        modal.querySelector('.provider-modal-content').addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // 保存按钮事件
        modal.querySelector('#saveModelBtn').addEventListener('click', async () => {
            const modelId = document.getElementById('modelId').value.trim();
            const modelName = document.getElementById('modelName').value.trim();
            const modelDescription = document.getElementById('modelDescription').value.trim();
            
            if (!modelId) {
                showToast('请输入模型 ID', 'error');
                return;
            }
            
            const model = {
                id: modelId,
                name: modelName || modelId
            };
            
            if (modelDescription) {
                model.description = modelDescription;
            }
            
            if (isKiro) {
                const kiroMapping = document.getElementById('kiroMapping').value.trim();
                if (kiroMapping) {
                    model.kiroMapping = kiroMapping;
                }
            }
            
            await this.addModel(providerKey, model);
            modal.remove();
        });
    }

    /**
     * 添加模型
     */
    async addModel(providerKey, model) {
        try {
            await window.apiClient.post('/models', {
                providerKey,
                model
            });
            
            showToast('模型添加成功', 'success');
            await this.loadModels();
        } catch (error) {
            console.error('Failed to add model:', error);
            showToast('添加模型失败: ' + error.message, 'error');
        }
    }

    /**
     * 编辑模型
     */
    async editModel(providerKey, modelId) {
        const provider = this.modelsData.providers[providerKey];
        if (!provider) return;
        
        const model = provider.models.find(m => m.id === modelId);
        if (!model) return;
        
        // 先关闭所有现有的模态框
        this.closeAllModals();
        
        // 检查是否是 claude-kiro
        const isKiro = providerKey === 'claude-kiro';
        
        const modal = document.createElement('div');
        modal.className = 'provider-modal';
        modal.innerHTML = `
            <div class="provider-modal-content" style="max-width: 600px;">
                <div class="provider-modal-header">
                    <h3><i class="fas fa-edit"></i> 编辑模型</h3>
                    <button class="modal-close" onclick="this.closest('.provider-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="provider-modal-body">
                    <div class="form-group">
                        <label for="modelId">模型 ID *</label>
                        <input type="text" id="modelId" class="form-control" value="${model.id}" required>
                    </div>
                    <div class="form-group">
                        <label for="modelName">模型名称</label>
                        <input type="text" id="modelName" class="form-control" value="${model.name || ''}" placeholder="例如: GPT-4">
                    </div>
                    <div class="form-group">
                        <label for="modelDescription">描述</label>
                        <textarea id="modelDescription" class="form-control" rows="2" placeholder="模型描述">${model.description || ''}</textarea>
                    </div>
                    ${isKiro ? `
                    <div class="form-group">
                        <label for="kiroMapping">Kiro 映射</label>
                        <input type="text" id="kiroMapping" class="form-control" value="${model.kiroMapping || ''}" placeholder="例如: CLAUDE_SONNET_4_5_20250929_V1_0">
                    </div>
                    ` : ''}
                </div>
                <div class="provider-modal-footer" style="padding: 1.5rem 2rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 1rem; background: var(--bg-secondary);">
                    <button class="btn btn-secondary" onclick="this.closest('.provider-modal').remove()">取消</button>
                    <button class="btn btn-success" id="saveModelBtn">
                        <i class="fas fa-save"></i> 保存
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        // 阻止模态框内容区域的点击事件冒泡
        modal.querySelector('.provider-modal-content').addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // 保存按钮事件
        modal.querySelector('#saveModelBtn').addEventListener('click', async () => {
            const newModelId = document.getElementById('modelId').value.trim();
            const modelName = document.getElementById('modelName').value.trim();
            const modelDescription = document.getElementById('modelDescription').value.trim();
            
            if (!newModelId) {
                showToast('请输入模型 ID', 'error');
                return;
            }
            
            const updatedModel = {
                id: newModelId,
                name: modelName || newModelId
            };
            
            if (modelDescription) {
                updatedModel.description = modelDescription;
            }
            
            if (isKiro) {
                const kiroMapping = document.getElementById('kiroMapping').value.trim();
                if (kiroMapping) {
                    updatedModel.kiroMapping = kiroMapping;
                }
            }
            
            await this.updateModel(providerKey, modelId, updatedModel);
            modal.remove();
        });
    }

    /**
     * 更新模型
     */
    async updateModel(providerKey, oldModelId, model) {
        try {
            await window.apiClient.put(`/models/${encodeURIComponent(providerKey)}/${encodeURIComponent(oldModelId)}`, {
                model
            });
            
            showToast('模型更新成功', 'success');
            await this.loadModels();
        } catch (error) {
            console.error('Failed to update model:', error);
            showToast('更新模型失败: ' + error.message, 'error');
        }
    }

    /**
     * 删除模型
     */
    async deleteModel(providerKey, modelId) {
        if (!confirm(`确定要删除模型 "${modelId}" 吗？`)) {
            return;
        }
        
        try {
            await window.apiClient.delete(`/models/${encodeURIComponent(providerKey)}/${encodeURIComponent(modelId)}`);
            
            showToast('模型删除成功', 'success');
            await this.loadModels();
        } catch (error) {
            console.error('Failed to delete model:', error);
            showToast('删除模型失败: ' + error.message, 'error');
        }
    }
}

// 创建全局实例
window.modelsManager = new ModelsManager();

export default ModelsManager;