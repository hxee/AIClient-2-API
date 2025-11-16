# 快速答案：模型列表获取 & 负载均衡

## ❓ 用户问题

**我现在想了解 Openai custom 渠道获取中模型列表的方式，是不是只会获取第一个供应商的模型列表，然后他的负载均衡，轮询是怎么操作的？**

---

## ✅ 快速答案

### 1️⃣ 模型列表获取方式

**是的，确实只获取第一个供应商的模型列表。** ❌

当你在 `provider_pools.json` 中配置了多个 `openai-custom` 供应商：

```json
{
  "openai-custom": [
    { "OPENAI_API_KEY": "sk-key1", ... },  // ← 第一个（会被使用）
    { "OPENAI_API_KEY": "sk-key2", ... },  // ← 第二个（被忽略）
    { "OPENAI_API_KEY": "sk-key3", ... }   // ← 第三个（被忽略）
  ]
}
```

当客户端调用 `GET /v1/models` 时：
- ✅ 系统找到 3 个健康的供应商
- ❌ 但**只使用第一个**的 API Key 获取模型列表
- ❌ 第二、三个供应商的模型**不会被显示**

**代码位置**：`src/common.js` 第 705 行
```javascript
const healthyProvider = healthyProviders[0];  // ← 只取第一个
```

---

### 2️⃣ 负载均衡和轮询机制

**负载均衡是完善的，使用 Round-Robin（轮询）算法。** ✅

但它**只在 API 请求时使用**，不在模型列表请求中使用。

#### 工作原理

假设配置了 3 个供应商，连续发来 6 个请求：

```
请求 1 → 选择 provider-001
请求 2 → 选择 provider-002
请求 3 → 选择 provider-003
请求 4 → 选择 provider-001 (轮回)
请求 5 → 选择 provider-002
请求 6 → 选择 provider-003
```

#### 选择算法

```javascript
// src/provider-pool-manager.js 第 86 行
const currentIndex = this.roundRobinIndex[providerType] || 0;
const providerIndex = currentIndex % availableAndHealthyProviders.length;
const selected = availableAndHealthyProviders[providerIndex];

// 更新轮询索引
this.roundRobinIndex[providerType] = (providerIndex + 1) % availableAndHealthyProviders.length;
```

**公式**：`providerIndex = currentIndex % availableCount`

这确保了：
- 每个供应商按顺序被选择
- 自动循环回到第一个
- 所有健康供应商均衡分配负载

#### 故障转移

如果某个供应商发生错误：
1. 标记为不健康（`isHealthy = false`）
2. 从轮询中排除
3. 定期健康检查（10分钟）
4. 恢复后重新加入轮询

**代码位置**：`src/provider-pool-manager.js` 第 61-97 行

---

## 📊 对比总结

| 特性 | 模型列表请求 | API 请求 |
|------|-----------|---------|
| **供应商使用数** | 1（只有第一个） | 多个（轮询） |
| **分布策略** | 无 | Round-Robin |
| **故障转移** | 无 | ✅ 自动 |
| **恢复机制** | 无 | ✅ 自动 |
| **负载均衡** | ❌ 无 | ✅ 有 |

---

## 🔧 代码位置速查表

### 模型列表相关
| 文件 | 行数 | 功能 |
|-----|------|------|
| src/common.js | 615-764 | 模型列表请求处理 |
| src/common.js | 693-715 | **只用第一个供应商的代码** |
| src/common.js | 631-675 | 从单个供应商获取模型 |
| src/api-manager.js | 24-32 | 路由 /v1/models 请求 |
| src/ollama-handler.js | 16-74 | Ollama /api/tags 端点 |

### 负载均衡相关
| 文件 | 行数 | 功能 |
|-----|------|------|
| src/provider-pool-manager.js | 61-97 | **selectProvider() - 轮询选择** |
| src/provider-pool-manager.js | 9-23 | 初始化 roundRobinIndex |
| src/provider-pool-manager.js | 104-147 | 健康检查标记 |
| src/provider-pool-manager.js | 191-232 | 定期健康检查 |
| src/common.js | 804-811 | 内容生成时的供应商选择 |

---

## 💡 改进建议

### 问题 1：模型列表只显示第一个供应商

**改进方案**：
```javascript
// 当前代码（只用第一个）
const healthyProvider = healthyProviders[0];

// 改进后（用所有供应商）
for (const healthyProvider of healthyProviders) {
    fetchPromises.push(fetchProviderModels(providerType, tempService, healthyProvider));
}
```

**优点**：
- 用户能看到所有可用的模型
- 不会遗漏特定 API Key 的模型
- 更好地利用多账号配置

**缺点**：
- 模型列表可能很长
- 需要去重处理（相同模型来自多个 Key）

### 问题 2：需要模型去重

```javascript
// 按模型 ID 去重
const uniqueModels = new Map();
for (const model of allModels) {
    const modelId = removeModelPrefix(model.id);
    if (!uniqueModels.has(modelId)) {
        uniqueModels.set(modelId, model);
    }
}
const dedupedModels = Array.from(uniqueModels.values());
```

---

## 🎯 关键配置参数

### provider_pools.json 中每个供应商的字段

```json
{
  "uuid": "unique-id",           // 唯一标识
  "OPENAI_API_KEY": "sk-...",   // API Key
  "isHealthy": true,             // 健康状态
  "isDisabled": false,           // 启用状态
  "errorCount": 0,               // 错误次数
  "lastErrorTime": null,         // 最后错误时间
  "usageCount": 0,               // 被使用次数
  "lastUsed": null              // 最后使用时间
}
```

### ProviderPoolManager 初始化参数

```javascript
new ProviderPoolManager(providerPools, {
    maxErrorCount: 3,                    // 达到3次错误标记为不健康
    healthCheckInterval: 10 * 60 * 1000, // 10分钟检查一次
    saveDebounceTime: 1000              // 1秒防抖
})
```

---

## 📚 详细文档

如需更详细的信息，请查看：

1. **[MODEL_LIST_AND_LOAD_BALANCING_ANALYSIS.md](./MODEL_LIST_AND_LOAD_BALANCING_ANALYSIS.md)**
   - 详细的代码分析
   - 工作流程图
   - 改进方案详解

2. **[LOAD_BALANCING_VISUAL_GUIDE.md](./LOAD_BALANCING_VISUAL_GUIDE.md)**
   - 可视化的流程图
   - 具体场景示例
   - 故障恢复演示

3. **[CONFIG_ARCHITECTURE.md](./CONFIG_ARCHITECTURE.md)**
   - provider_pools.json 配置详解
   - 启动流程
   - 最佳实践

---

## 🚀 实际操作例子

### 配置多个 OpenAI 供应商

```json
// provider_pools.json
{
  "openai-custom": [
    {
      "uuid": "main-api",
      "OPENAI_API_KEY": "sk-proj-main-xxxxx",
      "OPENAI_BASE_URL": "https://api.openai.com/v1",
      "checkHealth": true,
      "isHealthy": true,
      "isDisabled": false
    },
    {
      "uuid": "backup-api",
      "OPENAI_API_KEY": "sk-proj-backup-yyyyy",
      "OPENAI_BASE_URL": "https://api.openai.com/v1",
      "checkHealth": true,
      "isHealthy": true,
      "isDisabled": false
    }
  ]
}
```

### 模型列表请求行为

```bash
# 请求
curl -X GET "http://localhost:3000/v1/models" \
  -H "Authorization: Bearer your-api-key"

# 响应（当前只显示第一个 API Key 的模型）
{
  "object": "list",
  "data": [
    { "id": "[OpenAI] gpt-4", ... },
    { "id": "[OpenAI] gpt-4-turbo", ... },
    { "id": "[OpenAI] gpt-3.5-turbo", ... }
    # ❌ backup-api 的模型不会显示
  ]
}
```

### API 请求行为（负载均衡）

```bash
# 请求 1
curl -X POST "http://localhost:3000/v1/chat/completions" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model": "gpt-4", "messages": [...]}' \
# → 使用 main-api (uuid: main-api)

# 请求 2
curl -X POST "http://localhost:3000/v1/chat/completions" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model": "gpt-4", "messages": [...]}' \
# → 使用 backup-api (uuid: backup-api)

# 请求 3
curl -X POST "http://localhost:3000/v1/chat/completions" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model": "gpt-4", "messages": [...]}' \
# → 使用 main-api (uuid: main-api) - 轮回
```

---

## 📞 需要帮助？

如有任何疑问或想要改进这些功能，请参考：
- 配置架构说明：[CONFIG_ARCHITECTURE.md](./CONFIG_ARCHITECTURE.md)
- 完整代码分析：[MODEL_LIST_AND_LOAD_BALANCING_ANALYSIS.md](./MODEL_LIST_AND_LOAD_BALANCING_ANALYSIS.md)
- 可视化指南：[LOAD_BALANCING_VISUAL_GUIDE.md](./LOAD_BALANCING_VISUAL_GUIDE.md)
