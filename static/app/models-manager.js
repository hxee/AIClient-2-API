// 模型管理模块

import { showToast } from './utils.js';

/**
 * 模型管理类
 */
class ModelsManager {
    constructor() {
        this.modelsData = null;
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
        
        let html = '<div class="models-provider-list">';
        
        for (const [providerKey, providerData] of Object.entries(providers)) {
            const models = providerData.models || [];
            const description = providerData.description || '';
            
            html += `
                <div class="provider-card" data-provider="${providerKey}">
                    <div class="provider-card-header">
                        <div class="provider-info">
                            <h3>${this.getProviderDisplayName(providerKey)}</h3>
                            <p class="provider-description">${description}</p>
                        </div>
                        <div class="provider-actions">
                            <span class="model-count">${models.length} 个模型</span>
                            <button class="btn btn-primary btn-sm" onclick="window.modelsManager.showAddModelModal('${providerKey}')">
                                <i class="fas fa-plus"></i> 添加模型
                            </button>
                            <button class="btn btn-outline btn-sm toggle-models" data-provider="${providerKey}">
                                <i class="fas fa-chevron-down"></i>
                            </button>
                        </div>
                    </div>
                    <div class="provider-models-list" id="models-${providerKey}" style="display: none;">
                        ${this.renderModelsList(providerKey, models)}
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;

        // 添加展开/收起功能
        container.querySelectorAll('.toggle-models').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const providerKey = e.currentTarget.dataset.provider;
                const modelsList = document.getElementById(`models-${providerKey}`);
                const icon = e.currentTarget.querySelector('i');
                
                if (modelsList.style.display === 'none') {
                    modelsList.style.display = 'block';
                    icon.className = 'fas fa-chevron-up';
                } else {
                    modelsList.style.display = 'none';
                    icon.className = 'fas fa-chevron-down';
                }
            });
        });
    }

    /**
     * 渲染模型列表
     */
    renderModelsList(providerKey, models) {
        if (!models || models.length === 0) {
            return '<p class="no-models">暂无模型</p>';
        }

        let html = '<div class="models-vertical-list">';
        
        for (const model of models) {
            html += `
                <div class="model-item-vertical" data-model-id="${model.id}">
                    <div class="model-info">
                        <h4>${model.name || model.id}</h4>
                        <p class="model-id">ID: ${model.id}</p>
                        ${model.description ? `<p class="model-description">${model.description}</p>` : ''}
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
     * 获取提供商显示名称
     */
    getProviderDisplayName(providerKey) {
        const displayNames = {
            'openai-custom': 'OpenAI Custom',
            'openai-responses': 'OpenAI Responses',
            'gemini-cli': 'Gemini CLI',
            'claude-custom': 'Claude Custom',
            'claude-kiro': 'Claude Kiro',
            'qwen-api': 'Qwen API'
        };
        return displayNames[providerKey] || providerKey;
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
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>添加模型</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
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
                    <div class="form-group">
                        <label for="modelType">类型</label>
                        <select id="modelType" class="form-control">
                            <option value="chat">Chat</option>
                            <option value="responses">Responses</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-close">取消</button>
                    <button class="btn btn-primary" id="saveModelBtn">保存</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 关闭按钮事件
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        // 保存按钮事件
        modal.querySelector('#saveModelBtn').addEventListener('click', async () => {
            const modelId = document.getElementById('modelId').value.trim();
            const modelName = document.getElementById('modelName').value.trim();
            const modelDescription = document.getElementById('modelDescription').value.trim();
            const modelType = document.getElementById('modelType').value;
            
            if (!modelId) {
                showToast('请输入模型 ID', 'error');
                return;
            }
            
            const model = {
                id: modelId,
                name: modelName || modelId,
                type: modelType
            };
            
            if (modelDescription) {
                model.description = modelDescription;
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
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>编辑模型</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
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
                    <div class="form-group">
                        <label for="modelType">类型</label>
                        <select id="modelType" class="form-control">
                            <option value="chat" ${model.type === 'chat' ? 'selected' : ''}>Chat</option>
                            <option value="responses" ${model.type === 'responses' ? 'selected' : ''}>Responses</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-close">取消</button>
                    <button class="btn btn-primary" id="saveModelBtn">保存</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 关闭按钮事件
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        // 保存按钮事件
        modal.querySelector('#saveModelBtn').addEventListener('click', async () => {
            const newModelId = document.getElementById('modelId').value.trim();
            const modelName = document.getElementById('modelName').value.trim();
            const modelDescription = document.getElementById('modelDescription').value.trim();
            const modelType = document.getElementById('modelType').value;
            
            if (!newModelId) {
                showToast('请输入模型 ID', 'error');
                return;
            }
            
            const updatedModel = {
                id: newModelId,
                name: modelName || newModelId,
                type: modelType
            };
            
            if (modelDescription) {
                updatedModel.description = modelDescription;
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