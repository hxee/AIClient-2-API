# OpenAI Custom 模型映射功能设计

## 需求概述

为 OpenAI custom 提供商添加模型映射功能，允许用户在 UI 上配置供应商的真实模型映射到 `openai-chat-A/B/C/D`。

## 使用场景

**示例：**
- 供应商 x666 设置：`gpt-4-turbo` → 映射到 `openai-chat-A`
- 供应商 deepseek 设置：`deepseek-chat` → 映射到 `openai-chat-A`

当用户请求 `openai-chat-A` 时，系统会根据负载均衡或轮询策略，选择可用的供应商（x666 或 deepseek），并使用其映射的真实模型名称发起请求。

## 技术方案

### 1. 数据结构设计

在 `provider_pools.json` 中为每个 OpenAI custom 提供商添加 `modelMapping` 字段：

```json
{
  "openai-custom": [
    {
      "uuid": "xxx-xxx",
      "vendorName": "x666",
      "OPENAI_API_KEY": "sk-xxx",
      "OPENAI_BASE_URL": "https://x666.me/v1",
      "modelMapping": {
        "openai-chat-A": "gpt-4-turbo",
        "openai-chat-B": "gpt-3.5-turbo",
        "openai-chat-C": "gpt-4o",
        "openai-chat-D": "claude-3-opus"
      },
      "isHealthy": true,
      "isDisabled": false
    },
    {
      "uuid": "yyy-yyy",
      "vendorName": "deepseek",
      "OPENAI_API_KEY": "sk-yyy",
      "OPENAI_BASE_URL": "https://api.deepseek.com/v1",
      "modelMapping": {
        "openai-chat-A": "deepseek-chat",
        "openai-chat-B": "deepseek-coder"
      },
      "isHealthy": true,
      "isDisabled": false
    }
  ]
}
```

### 2. UI 界面设计

在提供商管理页面添加"模型映射"部分：

```
┌─────────────────────────────────────────┐
│ 提供商配置: x666                         │
├─────────────────────────────────────────┤
│ API Key: sk-xxx...                      │
│ Base URL: https://x666.me/v1            │
├─────────────────────────────────────────┤
│ 模型映射配置:                            │
│                                         │
│ ┌─────────────────────────────────────┐│
│ │ openai-chat-A → [gpt-4-turbo    ▼] ││
│ │ openai-chat-B → [gpt-3.5-turbo  ▼] ││
│ │ openai-chat-C → [gpt-4o         ▼] ││
│ │ openai-chat-D → [claude-3-opus  ▼] ││
│ │                                     ││
│ │ [+ 添加映射]                         ││
│ └─────────────────────────────────────┘│
│                                         │
│ [保存配置]  [取消]                       │
└─────────────────────────────────────────┘
```

**功能要点：**
1. 显示所有可用的 openai-chat-A/B/C/D 模型
2. 每个模型有一个下拉选择框，用户输入或选择供应商的真实模型名
3. 支持添加/删除映射
4. 保存时验证映射配置并更新 `provider_pools.json`

### 3. 后端处理逻辑

#### 3.1 请求路由逻辑

修改 `src/common.js` 中的模型处理逻辑：

```javascript
/**
 * 根据模型映射获取真实模型名称
 * @param {string} requestedModel - 请求的模型名 (如 'openai-chat-A')
 * @param {Object} providerConfig - 提供商配置
 * @returns {string} - 真实模型名称
 */
function getActualModelName(requestedModel, providerConfig) {
    // 如果提供商配置了模型映射，使用映射
    if (providerConfig.modelMapping && providerConfig.modelMapping[requestedModel]) {
        const actualModel = providerConfig.modelMapping[requestedModel];
        console.log(`[Model Mapping] ${requestedModel} → ${actualModel} (${providerConfig.vendorName})`);
        return actualModel;
    }
    
    // 否则使用原模型名
    return requestedModel;
}
```

#### 3.2 在 `handleContentGenerationRequest` 中应用映射

```javascript
// 在 common.js 的 handleContentGenerationRequest 函数中
// 获取提供商配置后，应用模型映射
const actualModel = getActualModelName(model, providerSelection.providerConfig);
console.log(`[Request] Original model: ${model}, Actual model: ${actualModel}`);

// 使用实际模型名发起请求
const correctService = await getApiService({
    ...CONFIG,
    MODEL_PROVIDER: toProvider,
    uuid: selectedProviderUuid
}, providerPoolManager);

// 传递实际模型名给服务
if (isStream) {
    await handleStreamRequest(res, correctService, actualModel, ...);
} else {
    await handleUnaryRequest(res, correctService, actualModel, ...);
}
```

### 4. UI API 端点

添加新的 API 端点来管理模型映射：

#### 4.1 获取提供商的模型映射
```
GET /api/ui/providers/{providerType}/{uuid}/model-mapping
```

响应：
```json
{
  "openai-chat-A": "gpt-4-turbo",
  "openai-chat-B": "gpt-3.5-turbo",
  "openai-chat-C": "gpt-4o",
  "openai-chat-D": null
}
```

#### 4.2 更新提供商的模型映射
```
PUT /api/ui/providers/{providerType}/{uuid}/model-mapping
```

请求体：
```json
{
  "modelMapping": {
    "openai-chat-A": "gpt-4-turbo",
    "openai-chat-B": "gpt-3.5-turbo",
    "openai-chat-C": "gpt-4o",
    "openai-chat-D": "claude-3-opus"
  }
}
```

### 5. 前端实现

在 `static/app/provider-manager.js` 中添加模型映射管理功能：

```javascript
// 渲染模型映射配置界面
function renderModelMappingUI(provider) {
    const mappingHtml = `
        <div class="model-mapping-section">
            <h4>模型映射配置</h4>
            <div class="mapping-list">
                ${['A', 'B', 'C', 'D'].map(letter => `
                    <div class="mapping-item">
                        <label>openai-chat-${letter}</label>
                        <input type="text" 
                               id="mapping-${letter}"
                               placeholder="输入供应商的真实模型名"
                               value="${provider.modelMapping?.['openai-chat-' + letter] || ''}">
                        <button onclick="clearMapping('${letter}')">清除</button>
                    </div>
                `).join('')}
            </div>
            <button onclick="saveModelMapping('${provider.uuid}')">保存映射</button>
        </div>
    `;
    return mappingHtml;
}

// 保存模型映射
async function saveModelMapping(uuid) {
    const mapping = {};
    ['A', 'B', 'C', 'D'].forEach(letter => {
        const value = document.getElementById(`mapping-${letter}`).value.trim();
        if (value) {
            mapping[`openai-chat-${letter}`] = value;
        }
    });
    
    await fetch(`/api/ui/providers/openai-custom/${uuid}/model-mapping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelMapping: mapping })
    });
    
    alert('模型映射已保存');
}
```

### 6. 实现步骤

1. **后端 API 实现** (src/ui-manager.js)
   - 添加 GET/PUT `/api/ui/providers/{type}/{uuid}/model-mapping` 端点
   - 实现读取和更新 provider_pools.json 中的 modelMapping 字段

2. **模型映射应用逻辑** (src/common.js)
   - 实现 `getActualModelName()` 函数
   - 在 `handleContentGenerationRequest` 中应用模型映射
   - 添加日志输出映射信息

3. **前端 UI 实现** (static/app/)
   - 在提供商编辑页面添加模型映射配置区域
   - 实现映射的增删改查功能
   - 添加表单验证和用户提示

4. **测试验证**
   - 配置两个不同供应商的映射
   - 测试请求 openai-chat-A 是否正确路由
   - 验证负载均衡功能正常工作

### 7. 注意事项

1. **向后兼容性**：如果提供商没有配置 modelMapping，使用原模型名
2. **验证**：确保映射的模型名不为空
3. **日志**：记录每次模型映射的应用情况
4. **UI 提示**：清楚地告知用户映射的作用和格式
5. **错误处理**：如果映射的模型在供应商处不存在，应该有适当的错误提示

### 8. 未来扩展

- 支持动态获取供应商支持的模型列表
- 添加模型映射的批量导入/导出功能
- 支持正则表达式匹配模型名
- 添加映射优先级和回退策略

## 总结

此功能将使 OpenAI custom 提供商更加灵活，用户可以方便地配置不同供应商的模型映射，实现统一的模型命名接口。

建议作为独立的功能开发任务进行，预计开发时间：2-3天。