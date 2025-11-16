# OpenAI Custom 渠道模型列表获取和负载均衡分析

## 📋 目录
1. [模型列表获取方式](#模型列表获取方式)
2. [负载均衡和轮询机制](#负载均衡和轮询机制)
3. [关键代码位置](#关键代码位置)
4. [工作流程图](#工作流程图)
5. [需要改进的地方](#需要改进的地方)

---

## 模型列表获取方式

### 当前实现（src/common.js 第615-764行）

#### 问题：只获取第一个供应商的模型列表

是的，**您的理解是正确的**。当前实现确实只获取每个供应商类型的**第一个健康供应商**的模型列表。

```javascript
// src/common.js 第693-715行
for (const [providerType, providers] of Object.entries(providerPoolManager.providerPools)) {
    // 找出所有健康且启用的提供商
    const healthyProviders = providers.filter(p => p.isHealthy && !p.isDisabled);
    
    if (healthyProviders.length === 0) {
        console.warn(`[ModelList] ⚠ ${providerType}: No healthy providers available`);
        continue;
    }
    
    console.log(`[ModelList] ${providerType}: Found ${healthyProviders.length} healthy provider(s)`);
    
    // ❌ 问题在这里：只使用第一个健康提供商
    const healthyProvider = healthyProviders[0];
    
    try {
        const tempConfig = { ...CONFIG, ...healthyProvider, MODEL_PROVIDER: providerType };
        const tempService = getServiceAdapter(tempConfig);
        providersList.push(providerType);
        fetchPromises.push(fetchProviderModels(providerType, tempService, healthyProvider));
    } catch (error) {
        console.error(`[ModelList] ✗ Failed to initialize service for ${providerType}: ${error.message}`);
    }
}
```

### 具体示例

假设您在 `provider_pools.json` 中配置了如下的 OpenAI 供应商池：

```json
{
  "openai-custom": [
    {
      "OPENAI_API_KEY": "sk-key1-xxx",
      "OPENAI_BASE_URL": "https://api.openai.com/v1",
      "uuid": "uuid-1",
      "isHealthy": true,
      "isDisabled": false
    },
    {
      "OPENAI_API_KEY": "sk-key2-yyy",
      "OPENAI_BASE_URL": "https://api.openai.com/v1",
      "uuid": "uuid-2",
      "isHealthy": true,
      "isDisabled": false
    },
    {
      "OPENAI_API_KEY": "sk-key3-zzz",
      "OPENAI_BASE_URL": "https://api.openai.com/v1",
      "uuid": "uuid-3",
      "isHealthy": true,
      "isDisabled": false
    }
  ]
}
```

当客户端调用 `/v1/models` 获取模型列表时：

1. ✓ 系统识别到有3个健康的 openai-custom 供应商
2. ❌ **但只使用第一个（uuid-1）的 API Key 调用** `/models` 端点
3. ❌ 结果：用户只看到第一个 API Key 配置的模型列表，看不到其他 API Key 可能有的模型

### 影响

- **模型可见性问题**：如果第二个或第三个 API Key 的权限更高或配额更多，用户将无法看到它们的模型
- **功能隐藏**：某些 API Key 可能有权访问特定的模型版本，但在模型列表中不可见
- **用户困惑**：用户可能会误认为只有这些模型可用

---

## 负载均衡和轮询机制

### 当前实现（src/provider-pool-manager.js 第61-97行）

#### 轮询机制在哪里使用？

负载均衡的轮询主要在**实际 API 请求**中使用，而不是在模型列表请求中使用。

```javascript
// src/provider-pool-manager.js 第61-97行
selectProvider(providerType, preferredUuid = null) {
    const availableProviders = this.providerStatus[providerType] || [];
    const availableAndHealthyProviders = availableProviders.filter(p =>
        p.config.isHealthy && !p.config.isDisabled
    );

    if (availableAndHealthyProviders.length === 0) {
        console.warn(`[ProviderPoolManager] No available and healthy providers for type: ${providerType}`);
        return null;
    }

    // 如果指定了偏好的 UUID，使用指定的
    const normalizedPreferredUuid = preferredUuid ? preferredUuid.toLowerCase() : null;
    if (normalizedPreferredUuid) {
        const preferredProvider = availableAndHealthyProviders.find(p => 
            (p.uuid || '').toLowerCase() === normalizedPreferredUuid
        );
        if (preferredProvider) {
            preferredProvider.config.lastUsed = new Date().toISOString();
            preferredProvider.config.usageCount++;
            console.log(`[ProviderPoolManager] Selected preferred provider for ${providerType}: ${preferredProvider.uuid}`);
            this._debouncedSave(providerType);
            return preferredProvider.config;
        }
    }

    // 使用轮询算法选择
    const currentIndex = this.roundRobinIndex[providerType] || 0;
    const providerIndex = currentIndex % availableAndHealthyProviders.length;
    const selected = availableAndHealthyProviders[providerIndex];

    // 递增轮询索引
    this.roundRobinIndex[providerType] = (providerIndex + 1) % availableAndHealthyProviders.length;
    selected.config.lastUsed = new Date().toISOString();
    selected.config.usageCount++;

    console.log(`[ProviderPoolManager] Selected provider for ${providerType} (round-robin): ${JSON.stringify(selected.config)}`);

    this._debouncedSave(providerType);
    return selected.config;
}
```

### 工作方式

#### 示例流程

配置了3个 OpenAI 供应商后，假设进来5个连续的 API 请求：

```
请求 1 → roundRobinIndex[openai-custom] = 0 → 0 % 3 = 0 → 选择第1个 (uuid-1)
         更新: roundRobinIndex[openai-custom] = 1

请求 2 → roundRobinIndex[openai-custom] = 1 → 1 % 3 = 1 → 选择第2个 (uuid-2)
         更新: roundRobinIndex[openai-custom] = 2

请求 3 → roundRobinIndex[openai-custom] = 2 → 2 % 3 = 2 → 选择第3个 (uuid-3)
         更新: roundRobinIndex[openai-custom] = 3

请求 4 → roundRobinIndex[openai-custom] = 3 → 3 % 3 = 0 → 选择第1个 (uuid-1)
         更新: roundRobinIndex[openai-custom] = 4

请求 5 → roundRobinIndex[openai-custom] = 4 → 4 % 3 = 1 → 选择第2个 (uuid-2)
         更新: roundRobinIndex[openai-custom] = 5
```

#### 关键特性

1. **轮询分布**：依次选择每个供应商，确保均衡使用
2. **状态追踪**：每个供应商记录：
   - `usageCount` - 被使用的次数
   - `lastUsed` - 最后使用时间
   - `errorCount` - 错误次数
   - `lastErrorTime` - 最后错误时间

3. **健康检查**：
   - 标记为 `isHealthy: false` 的供应商会被排除
   - 定期执行健康检查 `performHealthChecks()`
   - 恢复健康后重新加入轮询

### 轮询在实际请求中的使用

```javascript
// src/common.js 第804行
const providerSelection = getProviderByModelName(rawModel, providerPoolManager, CONFIG.MODEL_PROVIDER);

// 如果用户请求中包含供应商前缀（如 [OpenAI] gpt-4），则使用指定供应商
// 否则，selectProvider() 会使用轮询选择

// src/provider-pool-manager.js
const selected = providerPoolManager.selectProvider(toProvider);
```

---

## 关键代码位置

### 1. 模型列表请求处理

| 文件 | 行数 | 功能 |
|------|------|------|
| src/api-manager.js | 24-32 | 路由模型列表请求到 `/v1/models` 和 `/v1beta/models` |
| src/common.js | 615-764 | `handleModelListRequest()` - 处理模型列表逻辑 |
| src/common.js | 631-675 | `fetchProviderModels()` - 从单个供应商获取模型 |
| src/common.js | 693-715 | **只使用第一个健康供应商的代码** |
| src/ollama-handler.js | 16-74 | Ollama `/api/tags` 端点（也有相同问题） |

### 2. 负载均衡相关

| 文件 | 行数 | 功能 |
|------|------|------|
| src/provider-pool-manager.js | 9-23 | 初始化，设置 `roundRobinIndex` |
| src/provider-pool-manager.js | 61-97 | `selectProvider()` - 轮询选择 |
| src/provider-pool-manager.js | 104-123 | `markProviderUnhealthy()` - 标记不健康 |
| src/provider-pool-manager.js | 130-147 | `markProviderHealthy()` - 标记健康 |
| src/provider-pool-manager.js | 191-232 | `performHealthChecks()` - 定期健康检查 |

### 3. API 请求处理（使用轮询）

| 文件 | 行数 | 功能 |
|------|------|------|
| src/common.js | 777-842 | `handleContentGenerationRequest()` - 处理内容生成 |
| src/common.js | 804-811 | 获取选中的供应商和其 UUID |
| src/common.js | 834 | 调用 `getApiService()` 获取正确的服务 |

---

## 工作流程图

### 模型列表请求流程

```
客户端请求 GET /v1/models
    ↓
request-handler.js (第168-172行)
    ↓
ollama-handler.js:handleOllamaTags() 或
common.js:handleModelListRequest()
    ↓
遍历所有 providerPools 中的提供商类型
    ↓
对每个提供商类型：
    ✓ 找出所有健康且启用的供应商
    ✓ 获取第一个健康供应商（❌ 问题在这）
    ✓ 初始化该供应商的 service adapter
    ✓ 调用 listModels()
    ✓ 转换模型列表格式
    ✓ 添加模型前缀（[OpenAI], [Gemini] 等）
    ✓ 并行获取所有供应商的模型
    ↓
合并所有模型列表
    ↓
返回给客户端
```

### API 请求流程（使用负载均衡）

```
客户端请求 POST /v1/chat/completions (model: "[OpenAI] gpt-4")
    ↓
request-handler.js
    ↓
handleContentGenerationRequest()
    ↓
提取模型名称和流信息
    ↓
getProviderByModelName()
    ├─ 提取前缀 → [OpenAI]
    ├─ 找匹配的提供商类型 → openai-custom
    └─ 查找该类型的健康供应商
    ↓
selectProvider("openai-custom")  // ✅ 使用轮询
    ├─ 计算轮询索引: currentIndex % availableCount
    ├─ 选择对应的供应商
    └─ 递增轮询索引
    ↓
初始化该供应商的 service adapter
    ↓
转换请求格式
    ↓
调用 generateContent() 或 generateContentStream()
    ↓
返回响应给客户端
```

---

## 需要改进的地方

### 1. 模型列表聚合（推荐改进）

**当前问题**：只获取第一个供应商的模型列表

**改进方案**：获取所有健康供应商的模型列表

```javascript
// 改进前（当前代码）
const healthyProviders = providers.filter(p => p.isHealthy && !p.isDisabled);
const healthyProvider = healthyProviders[0];  // ❌ 只用第一个

// 改进后（建议）
const healthyProviders = providers.filter(p => p.isHealthy && !p.isDisabled);
for (const healthyProvider of healthyProviders) {  // ✅ 使用所有健康提供商
    fetchPromises.push(fetchProviderModels(providerType, tempService, healthyProvider));
}
```

**优点**：
- 用户能看到所有可用的模型
- 充分利用所有配置的 API Keys
- 发现隐藏的模型权限差异

**缺点**：
- 可能导致模型列表很长（如果配置了多个 API Key）
- 需要去重处理（同一模型来自多个 Key 时）

### 2. 模型去重（如果实现上述改进）

如果从多个供应商获取模型，应该去重并按供应商分组：

```javascript
const allModels = results.flat();

// 去重：按模型 ID 去重，保留第一个出现的
const uniqueModels = new Map();
for (const model of allModels) {
    const modelId = removeModelPrefix(model.id);
    if (!uniqueModels.has(modelId)) {
        uniqueModels.set(modelId, model);
    }
}

const dedupedModels = Array.from(uniqueModels.values());
```

### 3. 可选的模型聚合模式

可以添加一个配置参数来控制模型列表聚合策略：

```json
{
  "MODEL_LIST_STRATEGY": "first",  // "first" | "all" | "aggregate"
  "DEDUPLICATE_MODELS": true
}
```

- `first`：只显示第一个供应商的模型（当前行为）
- `all`：显示所有供应商的模型（带前缀区分）
- `aggregate`：合并后去重显示

---

## 总结

| 功能 | 当前状态 | 工作方式 |
|------|---------|---------|
| **模型列表请求** | ❌ 不完善 | 只获取第一个健康供应商的模型 |
| **API 请求负载均衡** | ✅ 完善 | 轮询算法，均衡分配到各个供应商 |
| **健康检查** | ✅ 完善 | 自动检测和恢复不健康的供应商 |
| **错误处理** | ✅ 完善 | 自动标记不健康，支持恢复 |
| **模型聚合** | ❌ 不足 | 无去重，需要手动管理 |

---

## 建议行动

1. **短期**：了解当前系统设计意图
2. **中期**：考虑是否需要改进模型列表聚合
3. **长期**：根据实际使用情况决定是否实现多供应商模型聚合
