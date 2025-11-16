// 模态框管理模块

import { showToast, getFieldLabel, getProviderTypeFields, escapeHtml, getProviderDisplayName } from './utils.js';
import { handleProviderPasswordToggle } from './event-handlers.js';

/**
 * 显示提供商管理模态框
 * @param {Object} data - 提供商数据
 */
function showProviderManagerModal(data) {
    const { providerType, providers, totalCount, healthyCount } = data;
    const providerDisplayName = getProviderDisplayName(providerType);
    
    // 移除已存在的模态框
    const existingModal = document.querySelector('.provider-modal');
    if (existingModal) {
        // 清理事件监听器
        if (existingModal.cleanup) {
            existingModal.cleanup();
        }
        existingModal.remove();
    }
    
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'provider-modal';
    modal.setAttribute('data-provider-type', providerType);
    modal.innerHTML = `
        <div class="provider-modal-content">
            <div class="provider-modal-header">
                <h3><i class="fas fa-cogs"></i> 管理 ${providerDisplayName} 提供商配置</h3>
                <button class="modal-close" onclick="window.closeProviderModal(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="provider-modal-body">
                <div class="provider-summary">
                    <div class="provider-summary-item">
                        <span class="label">总账户数:</span>
                        <span class="value">${totalCount}</span>
                    </div>
                    <div class="provider-summary-item">
                        <span class="label">健康账户:</span>
                        <span class="value">${healthyCount}</span>
                    </div>
                    <div class="provider-summary-actions">
                        <button class="btn btn-success" onclick="window.showAddProviderForm('${providerType}')">
                            <i class="fas fa-plus"></i> 添加 ${providerDisplayName} 账号
                        </button>
                    </div>
                </div>
                
                <div class="provider-list" id="providerList">
                    ${renderProviderList(providers, providerType)}
                </div>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(modal);
    
    // 添加模态框事件监听
    addModalEventListeners(modal);
}

/**
 * 为模态框添加事件监听器
 * @param {HTMLElement} modal - 模态框元素
 */
function addModalEventListeners(modal) {
    // ESC键关闭模态框
    const handleEscKey = (event) => {
        if (event.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    
    // 点击背景关闭模态框
    const handleBackgroundClick = (event) => {
        if (event.target === modal) {
            modal.remove();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    
    // 防止模态框内容区域点击时关闭模态框
    const modalContent = modal.querySelector('.provider-modal-content');
    const handleContentClick = (event) => {
        event.stopPropagation();
    };
    
    // 密码切换按钮事件处理
    const handlePasswordToggleClick = (event) => {
        const button = event.target.closest('.password-toggle');
        if (button) {
            event.preventDefault();
            event.stopPropagation();
            handleProviderPasswordToggle(button);
        }
    };
    
    // 上传按钮事件处理
    const handleUploadButtonClick = (event) => {
        const button = event.target.closest('.upload-btn');
        if (button) {
            event.preventDefault();
            event.stopPropagation();
            const targetInputId = button.getAttribute('data-target');
            if (targetInputId && window.fileUploadHandler) {
                window.fileUploadHandler.handleFileUpload(button, targetInputId);
            }
        }
    };
    
    // 添加事件监听器
    document.addEventListener('keydown', handleEscKey);
    modal.addEventListener('click', handleBackgroundClick);
    if (modalContent) {
        modalContent.addEventListener('click', handleContentClick);
        modalContent.addEventListener('click', handlePasswordToggleClick);
        modalContent.addEventListener('click', handleUploadButtonClick);
    }
    
    // 清理函数，在模态框关闭时调用
    modal.cleanup = () => {
        document.removeEventListener('keydown', handleEscKey);
        modal.removeEventListener('click', handleBackgroundClick);
        if (modalContent) {
            modalContent.removeEventListener('click', handleContentClick);
            modalContent.removeEventListener('click', handlePasswordToggleClick);
            modalContent.removeEventListener('click', handleUploadButtonClick);
        }
    };
}

/**
 * 关闭模态框并清理事件监听器
 * @param {HTMLElement} button - 关闭按钮
 */
function closeProviderModal(button) {
    const modal = button.closest('.provider-modal');
    if (modal) {
        if (modal.cleanup) {
            modal.cleanup();
        }
        modal.remove();
    }
}

/**
 * 渲染提供商列表
 * @param {Array} providers - 提供商数组
 * @returns {string} HTML字符串
 */
function renderProviderList(providers, providerType) {
    return providers.map(provider => {
        const isHealthy = provider.isHealthy;
        const isDisabled = provider.isDisabled || false;
        const lastUsed = provider.lastUsed ? new Date(provider.lastUsed).toLocaleString() : '从未使用';
        const healthClass = isHealthy ? 'healthy' : 'unhealthy';
        const disabledClass = isDisabled ? 'disabled' : '';
        const healthIcon = isHealthy ? 'fas fa-check-circle text-success' : 'fas fa-exclamation-triangle text-warning';
        const healthText = isHealthy ? '正常' : '异常';
        const disabledText = isDisabled ? '已禁用' : '已启用';
        const disabledIcon = isDisabled ? 'fas fa-ban text-muted' : 'fas fa-play text-success';
        const toggleButtonText = isDisabled ? '启用' : '禁用';
        const toggleButtonIcon = isDisabled ? 'fas fa-play' : 'fas fa-ban';
        const toggleButtonClass = isDisabled ? 'btn-success' : 'btn-warning';
        const displayName = provider.vendorName ? `${provider.vendorName} (${provider.uuid})` : provider.uuid;
        const vendorMeta = provider.vendorName ? `<span class="vendor-label"><i class="fas fa-store"></i> 供应商: ${escapeHtml(provider.vendorName)}</span> | ` : '';
        
        return `
            <div class="provider-item-detail ${healthClass} ${disabledClass}" data-uuid="${provider.uuid}">
                <div class="provider-item-header" onclick="window.toggleProviderDetails('${provider.uuid}')">
                    <div class="provider-info">
                        <div class="provider-name">${escapeHtml(displayName)}</div>
                        <div class="provider-meta">
                            ${vendorMeta}
                            <span class="health-status">
                                <i class="${healthIcon}"></i>
                                健康状态: ${healthText}
                            </span> |
                            <span class="disabled-status">
                                <i class="${disabledIcon}"></i>
                                状态: ${disabledText}
                            </span> |
                            使用次数: ${provider.usageCount || 0} |
                            失败次数: ${provider.errorCount || 0} |
                            最后使用: ${lastUsed}
                        </div>
                    </div>
                    <div class="provider-actions-group">
                        <button class="btn-small ${toggleButtonClass}" onclick="window.toggleProviderStatus('${provider.uuid}', event)" title="${toggleButtonText}此提供商">
                            <i class="${toggleButtonIcon}"></i> ${toggleButtonText}
                        </button>
                        <button class="btn-small btn-edit" onclick="window.editProvider('${provider.uuid}', event)">
                            <i class="fas fa-edit"></i> 编辑
                        </button>
                        <button class="btn-small btn-delete" onclick="window.deleteProvider('${provider.uuid}', event)">
                            <i class="fas fa-trash"></i> 删除
                        </button>
                    </div>
                </div>
                <div class="provider-item-content" id="content-${provider.uuid}">
                    <div class="">
                        ${renderProviderConfig(provider, providerType)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 渲染提供商配置
 * @param {Object} provider - 提供商对象
 * @returns {string} HTML字符串
 */
function renderProviderConfig(provider, providerType) {
    // 获取字段映射，确保顺序一致
    const fieldOrder = getFieldOrder(provider);
    
    // 检查是否为 openai-custom 提供商
    const isOpenAICustom = providerType === 'openai-custom';
    
    console.log('[renderProviderConfig] Provider Type:', providerType, 'isOpenAICustom:', isOpenAICustom);
    
    // 先渲染基础配置字段（checkModelName 和 checkHealth）
    let html = '<div class="form-grid">';
    const baseFields = ['checkModelName', 'checkHealth'];
    
    baseFields.forEach(fieldKey => {
        const displayLabel = getFieldLabel(fieldKey);
        const value = provider[fieldKey];
        const displayValue = value || '';
        
        // 如果是 checkHealth 字段，使用下拉选择框
        if (fieldKey === 'checkHealth') {
            // 如果没有值，默认为 false
            const actualValue = value !== undefined ? value : false;
            const isEnabled = actualValue === true || actualValue === 'true';
            html += `
                <div class="config-item">
                    <label>${displayLabel}</label>
                    <select class="form-control"
                            data-config-key="${fieldKey}"
                            data-config-value="${actualValue}"
                            disabled>
                        <option value="true" ${isEnabled ? 'selected' : ''}>启用</option>
                        <option value="false" ${!isEnabled ? 'selected' : ''}>禁用</option>
                    </select>
                </div>
            `;
        } else {
            // checkModelName 字段始终显示
            html += `
                <div class="config-item">
                    <label>${displayLabel}</label>
                    <input type="text"
                           value="${displayValue}"
                           readonly
                           data-config-key="${fieldKey}"
                           data-config-value="${value || ''}">
                </div>
            `;
        }
    });
    html += '</div>';
    
    // 渲染其他配置字段，每行2列
    const otherFields = fieldOrder.filter(key => !baseFields.includes(key));
    
    for (let i = 0; i < otherFields.length; i += 2) {
        html += '<div class="form-grid">';
        
        const field1Key = otherFields[i];
        const field1Label = getFieldLabel(field1Key);
        const field1Value = provider[field1Key];
        const field1IsPassword = field1Key.toLowerCase().includes('key') || field1Key.toLowerCase().includes('password');
        const field1IsOAuthFilePath = field1Key.includes('OAUTH_CREDS_FILE_PATH');
        const field1DisplayValue = field1IsPassword && field1Value ? '********' : (field1Value || '');
        
        if (field1IsPassword) {
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <div class="password-input-wrapper">
                        <input type="password"
                               value="${field1DisplayValue}"
                               readonly
                               data-config-key="${field1Key}"
                               data-config-value="${field1Value || ''}">
                        <button type="button" class="password-toggle" data-target="${field1Key}">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            `;
        } else if (field1IsOAuthFilePath) {
            // OAuth凭据文件路径字段，添加上传按钮
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <div class="file-input-group">
                        <input type="text"
                               id="edit-${provider.uuid}-${field1Key}"
                               value="${field1Value || ''}"
                               readonly
                               data-config-key="${field1Key}"
                               data-config-value="${field1Value || ''}">
                        <button type="button" class="btn btn-outline upload-btn" data-target="edit-${provider.uuid}-${field1Key}" aria-label="Upload file" disabled>
                            <i class="fas fa-upload"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <input type="text"
                           value="${field1DisplayValue}"
                           readonly
                           data-config-key="${field1Key}"
                           data-config-value="${field1Value || ''}">
                </div>
            `;
        }
        
        // 如果有第二个字段
        if (i + 1 < otherFields.length) {
            const field2Key = otherFields[i + 1];
            const field2Label = getFieldLabel(field2Key);
            const field2Value = provider[field2Key];
            const field2IsPassword = field2Key.toLowerCase().includes('key') || field2Key.toLowerCase().includes('password');
            const field2IsOAuthFilePath = field2Key.includes('OAUTH_CREDS_FILE_PATH');
            const field2DisplayValue = field2IsPassword && field2Value ? '********' : (field2Value || '');
            
            if (field2IsPassword) {
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <div class="password-input-wrapper">
                            <input type="password"
                                   value="${field2DisplayValue}"
                                   readonly
                                   data-config-key="${field2Key}"
                                   data-config-value="${field2Value || ''}">
                            <button type="button" class="password-toggle" data-target="${field2Key}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else if (field2IsOAuthFilePath) {
                // OAuth凭据文件路径字段，添加上传按钮
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <div class="file-input-group">
                            <input type="text"
                                   id="edit-${provider.uuid}-${field2Key}"
                                   value="${field2Value || ''}"
                                   readonly
                                   data-config-key="${field2Key}"
                                   data-config-value="${field2Value || ''}">
                        <button type="button" class="btn btn-outline upload-btn" data-target="edit-${provider.uuid}-${field2Key}" aria-label="Upload file" disabled>
                                <i class="fas fa-upload"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <input type="text"
                               value="${field2DisplayValue}"
                               readonly
                               data-config-key="${field2Key}"
                               data-config-value="${field2Value || ''}">
                    </div>
                `;
            }
        }
        
        html += '</div>';
    }
    
    // 如果是 openai-custom，添加模型映射部分
    if (isOpenAICustom) {
        html += renderModelMappingSection(provider);
    }
    
    return html;
}

/**
 * 渲染模型映射部分
 * @param {Object} provider - 提供商对象
 * @returns {string} HTML字符串
 */
function renderModelMappingSection(provider) {
    const modelMapping = provider.modelMapping || {};
    const mappingEntries = Object.entries(modelMapping);
    
    let html = `
        <div class="model-mapping-section">
            <div class="model-mapping-header">
                <h4><i class="fas fa-exchange-alt"></i> 模型映射配置</h4>
                <button class="btn-add-mapping" onclick="window.showAddMappingForm('${provider.uuid}')">
                    <i class="fas fa-plus"></i> 添加映射
                </button>
            </div>
            <div class="model-mapping-list" id="mapping-list-${provider.uuid}">
    `;
    
    if (mappingEntries.length === 0) {
        html += `
            <div class="model-mapping-empty">
                <i class="fas fa-info-circle"></i>
                <p>暂无模型映射配置</p>
                <small>点击"添加映射"按钮开始配置</small>
            </div>
        `;
    } else {
        mappingEntries.forEach(([clientModel, providerModel]) => {
            html += `
                <div class="model-mapping-item" data-client-model="${escapeHtml(clientModel)}">
                    <div class="mapping-model">
                        <div class="mapping-label">客户端模型:</div>
                        <div class="mapping-value">${escapeHtml(clientModel)}</div>
                    </div>
                    <div class="mapping-arrow">→</div>
                    <div class="mapping-model">
                        <div class="mapping-label">供应商模型:</div>
                        <div class="mapping-value">${escapeHtml(providerModel)}</div>
                    </div>
                    <div class="mapping-actions">
                        <button class="btn-edit-mapping" onclick="window.editMapping('${provider.uuid}', '${escapeHtml(clientModel)}', '${escapeHtml(providerModel)}')" title="编辑映射">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-delete-mapping" onclick="window.deleteMapping('${provider.uuid}', '${escapeHtml(clientModel)}')" title="删除映射">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    }
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

/**
 * 获取字段显示顺序
 * @param {Object} provider - 提供商对象
 * @returns {Array} 字段键数组
 */
function getFieldOrder(provider) {
    const orderedFields = ['vendorName', 'checkModelName', 'checkHealth'];
    
    // 获取所有其他配置项，排除 modelMapping 因为它有专门的渲染函数
    const otherFields = Object.keys(provider).filter(key =>
        key !== 'isHealthy' && key !== 'lastUsed' && key !== 'usageCount' &&
        key !== 'errorCount' && key !== 'lastErrorTime' && key !== 'uuid' &&
        key !== 'isDisabled' && key !== 'modelMapping' && !orderedFields.includes(key)
    );
    
    // 按字母顺序排序其他字段
    otherFields.sort();
    
    return [...orderedFields, ...otherFields].filter(key => provider.hasOwnProperty(key));
}

/**
 * 切换提供商详情显示
 * @param {string} uuid - 提供商UUID
 */
function toggleProviderDetails(uuid) {
    const content = document.getElementById(`content-${uuid}`);
    if (content) {
        content.classList.toggle('expanded');
    }
}

/**
 * 编辑提供商
 * @param {string} uuid - 提供商UUID
 * @param {Event} event - 事件对象
 */
function editProvider(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    const content = providerDetail.querySelector(`#content-${uuid}`);
    
    // 如果还没有展开，则自动展开编辑框
    if (content && !content.classList.contains('expanded')) {
        toggleProviderDetails(uuid);
    }
    
    // 等待一小段时间让展开动画完成，然后切换输入框为可编辑状态
    setTimeout(() => {
        // 切换输入框为可编辑状态
        configInputs.forEach(input => {
            input.readOnly = false;
            if (input.type === 'password') {
                const actualValue = input.dataset.configValue;
                input.value = actualValue;
            }
        });
        
        // 启用文件上传按钮
        const uploadButtons = providerDetail.querySelectorAll('.upload-btn');
        uploadButtons.forEach(button => {
            button.disabled = false;
        });
        
        // 启用下拉选择框
        configSelects.forEach(select => {
            select.disabled = false;
        });
        
        // 替换编辑按钮为保存和取消按钮，但保留禁用/启用按钮
        const actionsGroup = providerDetail.querySelector('.provider-actions-group');
        const toggleButton = actionsGroup.querySelector('[onclick*="toggleProviderStatus"]');
        const currentProvider = providerDetail.closest('.provider-modal').querySelector(`[data-uuid="${uuid}"]`);
        const isCurrentlyDisabled = currentProvider.classList.contains('disabled');
        const toggleButtonText = isCurrentlyDisabled ? 'Enable' : 'Disable';
        const toggleButtonIcon = isCurrentlyDisabled ? 'fas fa-play' : 'fas fa-ban';
        const toggleButtonClass = isCurrentlyDisabled ? 'btn-success' : 'btn-warning';
        
        actionsGroup.innerHTML = `
            <button class="btn-small ${toggleButtonClass}" onclick="window.toggleProviderStatus('${uuid}', event)" title="${toggleButtonText} this provider">
                <i class="${toggleButtonIcon}"></i> ${toggleButtonText}
            </button>
            <button class="btn-small btn-save" onclick="window.saveProvider('${uuid}', event)">
                <i class="fas fa-save"></i> Save
            </button>
            <button class="btn-small btn-cancel" onclick="window.cancelEdit('${uuid}', event)">
                <i class="fas fa-times"></i> Cancel
            </button>
        `;
    }, 100);
}

/**
 * 取消编辑
 * @param {string} uuid - 提供商UUID
 * @param {Event} event - 事件对象
 */
function cancelEdit(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    
    // 恢复输入框为只读状态
    configInputs.forEach(input => {
        input.readOnly = true;
        // 恢复显示为密码格式（如果有的话）
        if (input.type === 'password') {
            const actualValue = input.dataset.configValue;
            input.value = actualValue ? '********' : '';
        }
    });
    
    // 禁用文件上传按钮
    const uploadButtons = providerDetail.querySelectorAll('.upload-btn');
    uploadButtons.forEach(button => {
        button.disabled = true;
    });
    
    // 禁用下拉选择框
    configSelects.forEach(select => {
        select.disabled = true;
        // 恢复原始值
        const originalValue = select.dataset.configValue;
        select.value = originalValue || '';
    });
    
    // 恢复原来的编辑和删除按钮，但保留禁用/启用按钮
    const actionsGroup = providerDetail.querySelector('.provider-actions-group');
    const currentProvider = providerDetail.closest('.provider-modal').querySelector(`[data-uuid="${uuid}"]`);
    const isCurrentlyDisabled = currentProvider.classList.contains('disabled');
    const toggleButtonText = isCurrentlyDisabled ? 'Enable' : 'Disable';
    const toggleButtonIcon = isCurrentlyDisabled ? 'fas fa-play' : 'fas fa-ban';
    const toggleButtonClass = isCurrentlyDisabled ? 'btn-success' : 'btn-warning';
    
    actionsGroup.innerHTML = `
        <button class="btn-small ${toggleButtonClass}" onclick="window.toggleProviderStatus('${uuid}', event)" title="${toggleButtonText} this provider">
            <i class="${toggleButtonIcon}"></i> ${toggleButtonText}
        </button>
        <button class="btn-small btn-edit" onclick="window.editProvider('${uuid}', event)">
            <i class="fas fa-edit"></i> Edit
        </button>
        <button class="btn-small btn-delete" onclick="window.deleteProvider('${uuid}', event)">
            <i class="fas fa-trash"></i> Delete
        </button>
    `;
}

/**
 * 保存提供商
 * @param {string} uuid - 提供商UUID
 * @param {Event} event - 事件对象
 */
async function saveProvider(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    const providerConfig = {};
    
    configInputs.forEach(input => {
        const key = input.dataset.configKey;
        const value = input.value;
        providerConfig[key] = value;
    });
    
    configSelects.forEach(select => {
        const key = select.dataset.configKey;
        const value = select.value === 'true';
        providerConfig[key] = value;
    });
    
    try {
        await window.apiClient.put(`/providers/${encodeURIComponent(providerType)}/${uuid}`, { providerConfig });
        showToast('Provider configuration updated successfully', 'success');
        // 重新获取该提供商类型的最新配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to update provider:', error);
        showToast('Update failed: ' + error.message, 'error');
    }
}

/**
 * 删除提供商
 * @param {string} uuid - 提供商UUID
 * @param {Event} event - 事件对象
 */
async function deleteProvider(uuid, event) {
    event.stopPropagation();
    
    if (!confirm('Delete this provider configuration? This action cannot be undone.')) {
        return;
    }
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    
    try {
        await window.apiClient.delete(`/providers/${encodeURIComponent(providerType)}/${uuid}`);
        showToast('Provider configuration deleted successfully', 'success');
        // 重新获取最新配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to delete provider:', error);
        showToast('Delete failed: ' + error.message, 'error');
    }
}

/**
 * 重新获取并刷新提供商配置
 * @param {string} providerType - 提供商类型
 */
async function refreshProviderConfig(providerType) {
    try {
        // 重新获取该提供商类型的最新数据
        const data = await window.apiClient.get(`/providers/${encodeURIComponent(providerType)}`);
        
        // 如果当前显示的是该提供商类型的模态框，则更新模态框
        const modal = document.querySelector('.provider-modal');
        if (modal && modal.getAttribute('data-provider-type') === providerType) {
            // 更新统计信息
            const totalCountElement = modal.querySelector('.provider-summary-item .value');
            if (totalCountElement) {
                totalCountElement.textContent = data.totalCount;
            }
            
            const healthyCountElement = modal.querySelectorAll('.provider-summary-item .value')[1];
            if (healthyCountElement) {
                healthyCountElement.textContent = data.healthyCount;
            }
            
            // 重新渲染提供商列表
            const providerList = modal.querySelector('.provider-list');
            if (providerList) {
                providerList.innerHTML = renderProviderList(data.providers, providerType);
            }
        }
        
        // 同时更新主界面的提供商统计数据
        if (typeof window.loadProviders === 'function') {
            await window.loadProviders();
        }
        
    } catch (error) {
        console.error('Failed to refresh provider config:', error);
    }
}

/**
 * 在模态框中刷新提供商配置（供文件上传后调用）
 * @param {string} providerType - 提供商类型
 */
async function refreshProviderConfigInModal(providerType) {
    await refreshProviderConfig(providerType);
}

/**
 * 显示添加提供商表单
 * @param {string} providerType - 提供商类型
 */
/**

 * Render the add-provider form inside the modal.

 * @param {string} providerType - Provider type identifier.

 */

function showAddProviderForm(providerType) {

    const modal = document.querySelector('.provider-modal');

    if (!modal) {

        return;

    }



    const existingForm = modal.querySelector('.add-provider-form');

    if (existingForm) {

        existingForm.remove();

        return;

    }



    const providerDisplayName = getProviderDisplayName(providerType);

    const form = document.createElement('div');

    form.className = 'add-provider-form';



    const showVendorField = providerType.includes('-custom');

    const vendorFieldHtml = showVendorField ? `

        <div class="form-grid">

            <div class="form-group" style="grid-column: 1 / -1;">

                <label>Vendor Name <span class="required-mark" style="color: #e74c3c;">* (required)</span></label>

                <input type="text" id="newVendorName" placeholder="e.g. anyrouter, deepseek, azure, official" required>

                <small style="color: #888; margin-top: 5px; display: block;">

                    <strong>Vendor name is required</strong> to distinguish accounts from the same channel.

                    This value is only used in the console and will not create a new channel or change routing.

                </small>

            </div>

        </div>

    ` : '';



    form.innerHTML = `

        <h4><i class="fas fa-plus"></i> Add ${providerDisplayName} provider</h4>

        ${vendorFieldHtml}

        <div class="form-grid">

            <div class="form-group">

                <label>Health Check Model <span class="optional-mark">(optional)</span></label>

                <input type="text" id="newCheckModelName" placeholder="e.g. gpt-3.5-turbo">

            </div>

            <div class="form-group">

                <label>Health Check</label>

                <select id="newCheckHealth">

                    <option value="true">Enabled</option>

                    <option value="false">Disabled</option>

                </select>

            </div>

        </div>

        <div id="dynamicConfigFields">

            <!-- Dynamic config fields go here -->

        </div>

        <div class="form-actions" style="margin-top: 15px;">

            <button class="btn btn-success" onclick="window.addProvider('${providerType}')">

                <i class="fas fa-save"></i> Save

            </button>

            <button class="btn btn-secondary" onclick="this.closest('.add-provider-form').remove()">

                <i class="fas fa-times"></i> Cancel

            </button>

        </div>

    `;



    addDynamicConfigFields(form, providerType);

    bindAddFormPasswordToggleListeners(form);



    const providerList = modal.querySelector('.provider-list');

    if (providerList && providerList.parentNode) {

        providerList.parentNode.insertBefore(form, providerList);

    }

}



function addDynamicConfigFields(form, providerType) {
    const configFields = form.querySelector('#dynamicConfigFields');
    
    // 获取该提供商类型的字段配置
    const providerFields = getProviderTypeFields(providerType);
    let fields = '';
    
    if (providerFields.length > 0) {
        // 分组显示，每行两个字段
        for (let i = 0; i < providerFields.length; i += 2) {
            fields += '<div class="form-grid">';
            
            const field1 = providerFields[i];
            // 检查是否为密码类型字段
            const isPassword1 = field1.type === 'password';
            // 检查是否为OAuth凭据文件路径字段
            const isOAuthFilePath1 = field1.id.includes('OauthCredsFilePath');
            
            if (isPassword1) {
                fields += `
                    <div class="form-group">
                        <label>${field1.label}</label>
                        <div class="password-input-wrapper">
                            <input type="password" id="new${field1.id}" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                            <button type="button" class="password-toggle" data-target="new${field1.id}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else if (isOAuthFilePath1) {
                // OAuth凭据文件路径字段，添加上传按钮
                fields += `
                    <div class="form-group">
                        <label>${field1.label}</label>
                        <div class="file-input-group">
                            <input type="text" id="new${field1.id}" class="form-control" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                            <button type="button" class="btn btn-outline upload-btn" data-target="new${field1.id}" aria-label="Upload file">
                                <i class="fas fa-upload"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                fields += `
                    <div class="form-group">
                        <label>${field1.label}</label>
                        <input type="${field1.type}" id="new${field1.id}" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                    </div>
                `;
            }
            
            const field2 = providerFields[i + 1];
            if (field2) {
                // 检查是否为密码类型字段
                const isPassword2 = field2.type === 'password';
                // 检查是否为OAuth凭据文件路径字段
                const isOAuthFilePath2 = field2.id.includes('OauthCredsFilePath');
                
                if (isPassword2) {
                    fields += `
                        <div class="form-group">
                            <label>${field2.label}</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="new${field2.id}" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                                <button type="button" class="password-toggle" data-target="new${field2.id}">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    `;
                } else if (isOAuthFilePath2) {
                    // OAuth凭据文件路径字段，添加上传按钮
                    fields += `
                        <div class="form-group">
                            <label>${field2.label}</label>
                            <div class="file-input-group">
                                <input type="text" id="new${field2.id}" class="form-control" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                                <button type="button" class="btn btn-outline upload-btn" data-target="new${field2.id}" aria-label="Upload file">
                                    <i class="fas fa-upload"></i>
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    fields += `
                        <div class="form-group">
                            <label>${field2.label}</label>
                            <input type="${field2.type}" id="new${field2.id}" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                        </div>
                    `;
                }
            }
            
            fields += '</div>';
        }
    } else {
        fields = '<p>不支持的提供商类型</p>';
    }
    
    configFields.innerHTML = fields;
}

/**
 * 为添加新提供商表单中的密码切换按钮绑定事件监听器
 * @param {HTMLElement} form - 表单元素
 */
function bindAddFormPasswordToggleListeners(form) {
    const passwordToggles = form.querySelectorAll('.password-toggle');
    passwordToggles.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const icon = this.querySelector('i');
            
            if (!input || !icon) return;
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
}

/**
 * 添加新提供商
 * @param {string} providerType - 提供商类型
 */
async function addProvider(providerType) {
    const checkModelName = document.getElementById('newCheckModelName')?.value;
    const checkHealth = document.getElementById('newCheckHealth')?.value === 'true';
    const vendorName = document.getElementById('newVendorName')?.value?.trim();
    
    if (providerType.includes('-custom') && !vendorName) {
        showToast('Vendor name cannot be empty. Different accounts may have different endpoints or permissions, so please provide a label.', 'error');
        return;
    }
    
    const providerConfig = {
        checkModelName: checkModelName || '',
        checkHealth
    };
    
    if (vendorName) {
        providerConfig.vendorName = vendorName;
    }
    
    switch (providerType) {
        case 'openai-custom':
            providerConfig.OPENAI_API_KEY = document.getElementById('newOpenaiApiKey')?.value || '';
            providerConfig.OPENAI_BASE_URL = document.getElementById('newOpenaiBaseUrl')?.value || '';
            if (!providerConfig.OPENAI_API_KEY) {
                showToast('OpenAI API Key is required', 'error');
                return;
            }
            break;
        case 'openaiResponses-custom':
            providerConfig.OPENAI_API_KEY = document.getElementById('newOpenaiApiKey')?.value || '';
            providerConfig.OPENAI_BASE_URL = document.getElementById('newOpenaiBaseUrl')?.value || '';
            if (!providerConfig.OPENAI_API_KEY) {
                showToast('OpenAI API Key is required', 'error');
                return;
            }
            break;
        case 'claude-custom':
            providerConfig.CLAUDE_API_KEY = document.getElementById('newClaudeApiKey')?.value || '';
            providerConfig.CLAUDE_BASE_URL = document.getElementById('newClaudeBaseUrl')?.value || '';
            if (!providerConfig.CLAUDE_API_KEY) {
                showToast('Claude API Key is required', 'error');
                return;
            }
            break;
        case 'gemini-cli-oauth':
            providerConfig.PROJECT_ID = document.getElementById('newProjectId')?.value || '';
            providerConfig.GEMINI_OAUTH_CREDS_FILE_PATH = document.getElementById('newGeminiOauthCredsFilePath')?.value || '';
            if (!providerConfig.GEMINI_OAUTH_CREDS_FILE_PATH) {
                showToast('OAuth credential file path is required', 'error');
                return;
            }
            break;
        case 'claude-kiro-oauth':
            providerConfig.KIRO_OAUTH_CREDS_FILE_PATH = document.getElementById('newKiroOauthCredsFilePath')?.value || '';
            if (!providerConfig.KIRO_OAUTH_CREDS_FILE_PATH) {
                showToast('OAuth credential file path is required', 'error');
                return;
            }
            break;
        case 'openai-qwen-oauth':
            providerConfig.QWEN_OAUTH_CREDS_FILE_PATH = document.getElementById('newQwenOauthCredsFilePath')?.value || '';
            if (!providerConfig.QWEN_OAUTH_CREDS_FILE_PATH) {
                showToast('OAuth credential file path is required', 'error');
                return;
            }
            break;
        default:
            showToast('Unsupported provider type: ' + providerType, 'error');
            return;
    }
    
    console.log('[Add Provider] Provider Type:', providerType);
    console.log('[Add Provider] Vendor Name:', vendorName || 'none');
    console.log('[Add Provider] Provider Config:', providerConfig);
    console.log('[Add Provider] Request URL:', '/providers');
    console.log('[Add Provider] Full API URL:', window.location.origin + '/api/providers');
    
    try {
        console.log('[Add Provider] Sending POST request to /providers...');
        const response = await window.apiClient.post('/providers', {
            providerType,
            providerConfig
        });
        console.log('[Add Provider] Response received:', response);
        showToast('Provider added successfully', 'success');
        const form = document.querySelector('.add-provider-form');
        if (form) {
            form.remove();
        }
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to add provider:', error);
        showToast('Add failed: ' + error.message, 'error');
    }
}

async function toggleProviderStatus(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    const currentProvider = providerDetail.closest('.provider-modal').querySelector(`[data-uuid="${uuid}"]`);
    
    // 获取当前提供商信息
    const isCurrentlyDisabled = currentProvider.classList.contains('disabled');
    const action = isCurrentlyDisabled ? 'enable' : 'disable';
    const confirmMessage = isCurrentlyDisabled ?
        `Enable this provider configuration?` :
        `Disable this provider configuration? Disabled providers will not be selected.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        await window.apiClient.post(`/providers/${encodeURIComponent(providerType)}/${uuid}/${action}`, { action });
        showToast(`Provider ${isCurrentlyDisabled ? 'enabled' : 'disabled'} successfully`, 'success');
        // 重新获取该提供商类型的最新配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to toggle provider status:', error);
        showToast(`Operation failed: ${error.message}`, 'error');
    }
}

/**
 * 显示添加模型映射表单
 * @param {string} providerUuid - 提供商UUID
 */
async function showAddMappingForm(providerUuid) {
    const modal = document.querySelector('.provider-modal');
    const providerType = modal.getAttribute('data-provider-type');
    
    // 加载 models.json 中的模型列表
    let availableModels = [];
    try {
        console.log('[showAddMappingForm] Loading models.json...');
        const authToken = localStorage.getItem('authToken');
        console.log('[showAddMappingForm] Auth token exists:', !!authToken);
        
        // 不发送 Authorization 头，避免静态文件请求被拒绝
        const modelsConfigResponse = await fetch('/models.json', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('[showAddMappingForm] Response status:', modelsConfigResponse.status);
        
        if (!modelsConfigResponse.ok) {
            const errorText = await modelsConfigResponse.text();
            console.error('[showAddMappingForm] Response error:', errorText);
            throw new Error(`HTTP error! status: ${modelsConfigResponse.status}`);
        }
        
        const modelsConfig = await modelsConfigResponse.json();
        console.log('[showAddMappingForm] Loaded config:', modelsConfig);
        
        if (modelsConfig.providers && modelsConfig.providers['openai-custom']) {
            availableModels = modelsConfig.providers['openai-custom'].models || [];
            console.log('[showAddMappingForm] Available models:', availableModels);
        } else {
            console.warn('[showAddMappingForm] No openai-custom provider found in config');
        }
        
        if (availableModels.length === 0) {
            showToast('models.json 中没有配置 openai-custom 模型', 'warning');
            console.warn('[showAddMappingForm] No models found for openai-custom');
        }
    } catch (error) {
        console.error('[showAddMappingForm] Failed to load models config:', error);
        showToast('加载模型配置失败: ' + error.message, 'error');
        return;
    }
    
    // 创建添加映射表单
    const mappingList = document.getElementById(`mapping-list-${providerUuid}`);
    const existingForm = mappingList.querySelector('.add-mapping-form');
    
    if (existingForm) {
        existingForm.remove();
        return;
    }
    
    const formHtml = `
        <div class="add-mapping-form" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h5 style="margin: 0 0 15px 0;"><i class="fas fa-plus-circle"></i> 添加新映射</h5>
            <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">客户端模型 <span class="required-mark" style="color: #e74c3c;">*</span></label>
                    <select id="new-client-model-${providerUuid}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <option value="">-- 选择模型 --</option>
                        ${availableModels.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.id)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">供应商模型名称 <span class="required-mark" style="color: #e74c3c;">*</span></label>
                    <input type="text" id="new-provider-model-${providerUuid}" class="form-control" placeholder="例如: gpt-4-turbo" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">输入供应商API实际使用的模型名称</small>
                </div>
            </div>
            <div class="form-actions" style="margin-top: 15px; display: flex; gap: 10px;">
                <button class="btn btn-success btn-sm" onclick="window.saveNewMapping('${providerUuid}')" style="padding: 6px 12px;">
                    <i class="fas fa-save"></i> 保存
                </button>
                <button class="btn btn-secondary btn-sm" onclick="this.closest('.add-mapping-form').remove()" style="padding: 6px 12px;">
                    <i class="fas fa-times"></i> 取消
                </button>
            </div>
        </div>
    `;
    
    mappingList.insertAdjacentHTML('afterbegin', formHtml);
}

/**
 * 保存新的模型映射
 * @param {string} providerUuid - 提供商UUID
 */
async function saveNewMapping(providerUuid) {
    const modal = document.querySelector('.provider-modal');
    const providerType = modal.getAttribute('data-provider-type');
    
    const clientModel = document.getElementById(`new-client-model-${providerUuid}`).value;
    const providerModel = document.getElementById(`new-provider-model-${providerUuid}`).value.trim();
    
    if (!clientModel || !providerModel) {
        showToast('请填写完整的映射信息', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/providers/${encodeURIComponent(providerType)}/${providerUuid}/model-mapping`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                clientModel,
                providerModel
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || '添加失败');
        }
        
        showToast('模型映射添加成功', 'success');
        
        // 刷新提供商配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to add model mapping:', error);
        showToast('添加映射失败: ' + error.message, 'error');
    }
}

/**
 * 编辑模型映射
 * @param {string} providerUuid - 提供商UUID
 * @param {string} clientModel - 客户端模型名称
 * @param {string} currentProviderModel - 当前供应商模型名称
 */
async function editMapping(providerUuid, clientModel, currentProviderModel) {
    const modal = document.querySelector('.provider-modal');
    const providerType = modal.getAttribute('data-provider-type');
    
    // 加载 models.json 中的模型列表
    let availableModels = [];
    try {
        const modelsConfigResponse = await fetch('/models.json', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (modelsConfigResponse.ok) {
            const modelsConfig = await modelsConfigResponse.json();
            if (modelsConfig.providers && modelsConfig.providers['openai-custom']) {
                availableModels = modelsConfig.providers['openai-custom'].models || [];
            }
        }
    } catch (error) {
        console.error('[editMapping] Failed to load models config:', error);
    }
    
    // 创建编辑表单
    const mappingList = document.getElementById(`mapping-list-${providerUuid}`);
    
    // 移除已存在的编辑表单
    const existingEditForm = mappingList.querySelector('.edit-mapping-form');
    if (existingEditForm) {
        existingEditForm.remove();
    }
    
    // 查找当前映射项
    const mappingItem = mappingList.querySelector(`[data-client-model="${escapeHtml(clientModel)}"]`);
    if (!mappingItem) return;
    
    const formHtml = `
        <div class="edit-mapping-form" style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid #ffc107;">
            <h5 style="margin: 0 0 15px 0;"><i class="fas fa-edit"></i> 编辑映射</h5>
            <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">客户端模型 <span class="required-mark" style="color: #e74c3c;">*</span></label>
                    <select id="edit-client-model-${providerUuid}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <option value="${escapeHtml(clientModel)}" selected>${escapeHtml(clientModel)}</option>
                        ${availableModels.filter(m => m.id !== clientModel).map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.id)}</option>`).join('')}
                    </select>
                    <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">选择要映射的客户端模型</small>
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">供应商模型名称 <span class="required-mark" style="color: #e74c3c;">*</span></label>
                    <input type="text" id="edit-provider-model-${providerUuid}" class="form-control" value="${escapeHtml(currentProviderModel)}" placeholder="例如: gpt-4-turbo" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">输入供应商API实际使用的模型名称</small>
                </div>
            </div>
            <div class="form-actions" style="margin-top: 15px; display: flex; gap: 10px;">
                <button class="btn btn-primary btn-sm" onclick="window.saveEditedMapping('${providerUuid}', '${escapeHtml(clientModel)}')" style="padding: 6px 12px;">
                    <i class="fas fa-save"></i> 保存
                </button>
                <button class="btn btn-secondary btn-sm" onclick="this.closest('.edit-mapping-form').remove()" style="padding: 6px 12px;">
                    <i class="fas fa-times"></i> 取消
                </button>
            </div>
        </div>
    `;
    
    mappingItem.insertAdjacentHTML('afterend', formHtml);
}

/**
 * 保存编辑后的模型映射
 * @param {string} providerUuid - 提供商UUID
 * @param {string} originalClientModel - 原始客户端模型名称
 */
async function saveEditedMapping(providerUuid, originalClientModel) {
    const modal = document.querySelector('.provider-modal');
    const providerType = modal.getAttribute('data-provider-type');
    
    const newClientModel = document.getElementById(`edit-client-model-${providerUuid}`).value;
    const newProviderModel = document.getElementById(`edit-provider-model-${providerUuid}`).value.trim();
    
    if (!newClientModel || !newProviderModel) {
        showToast('请填写完整的映射信息', 'error');
        return;
    }
    
    try {
        // 如果客户端模型改变了，需要先删除旧的映射
        if (newClientModel !== originalClientModel) {
            await fetch(`/api/providers/${encodeURIComponent(providerType)}/${providerUuid}/model-mapping`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ clientModel: originalClientModel })
            });
        }
        
        // 添加/更新新的映射
        const response = await fetch(`/api/providers/${encodeURIComponent(providerType)}/${providerUuid}/model-mapping`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                clientModel: newClientModel,
                providerModel: newProviderModel
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || '更新失败');
        }
        
        showToast('模型映射更新成功', 'success');
        
        // 刷新提供商配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to update model mapping:', error);
        showToast('更新映射失败: ' + error.message, 'error');
    }
}

/**
 * 删除模型映射
 * @param {string} providerUuid - 提供商UUID
 * @param {string} clientModel - 客户端模型名称
 */
async function deleteMapping(providerUuid, clientModel) {
    const modal = document.querySelector('.provider-modal');
    const providerType = modal.getAttribute('data-provider-type');
    
    if (!confirm(`确定要删除映射 "${clientModel}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/providers/${encodeURIComponent(providerType)}/${providerUuid}/model-mapping`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ clientModel })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || '删除失败');
        }
        
        showToast('模型映射删除成功', 'success');
        
        // 刷新提供商配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to delete model mapping:', error);
        showToast('删除映射失败: ' + error.message, 'error');
    }
}

// 导出所有函数，并挂载到window对象供HTML调用
export {
    showProviderManagerModal,
    closeProviderModal,
    toggleProviderDetails,
    editProvider,
    cancelEdit,
    saveProvider,
    deleteProvider,
    refreshProviderConfig,
    refreshProviderConfigInModal,
    showAddProviderForm,
    addProvider,
    toggleProviderStatus,
    showAddMappingForm,
    saveNewMapping,
    editMapping,
    saveEditedMapping,
    deleteMapping
};

// 将函数挂载到window对象
window.closeProviderModal = closeProviderModal;
window.toggleProviderDetails = toggleProviderDetails;
window.editProvider = editProvider;
window.cancelEdit = cancelEdit;
window.saveProvider = saveProvider;
window.deleteProvider = deleteProvider;
window.refreshProviderConfig = refreshProviderConfig;
window.refreshProviderConfigInModal = refreshProviderConfigInModal;
window.showAddProviderForm = showAddProviderForm;
window.addProvider = addProvider;
window.toggleProviderStatus = toggleProviderStatus;
window.showAddMappingForm = showAddMappingForm;
window.saveNewMapping = saveNewMapping;
window.editMapping = editMapping;
window.saveEditedMapping = saveEditedMapping;
window.deleteMapping = deleteMapping;
