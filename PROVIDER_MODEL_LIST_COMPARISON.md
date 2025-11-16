# 所有渠道模型列表获取方式对比

用户问题：**那其它几个渠道是如何获取模型的？**

这是一份详细的对比分档，说明系统中所有提供商渠道的模型列表获取方式。

---

## 📊 快速对比表

| 渠道 | 获取方式 | 数据来源 | 是否动态 | 返回格式 | 文件位置 |
|------|--------|--------|--------|---------|--------|
| **OpenAI Custom** | API 请求 `/models` | 后端 API | ✅ 动态 | OpenAI 格式 | openai-core.js:144-154 |
| **OpenAI Responses** | API 请求 `/models` | 后端 API | ✅ 动态 | OpenAI 格式 | openai-responses-core.js:135-145 |
| **Gemini CLI** | 固定模型列表 | 代码常量 | ❌ 静态 | Gemini 格式 | gemini-core.js:17, 314-315 |
| **Claude Custom** | 固定模型列表 | 代码常量 | ❌ 静态 | Claude 格式 | claude-core.js:194-210 |
| **Claude Kiro** | 静态映射表 | 代码常量 | ❌ 静态 | Claude 格式 | claude-kiro.js:23-30, 1116-1121 |
| **Qwen OAuth** | 固定模型列表 | 代码常量 | ❌ 静态 | OpenAI 格式 | qwen-core.js:13-15, 605-609 |

---

## 🔍 各渠道详细对比

### 1️⃣ OpenAI Custom（动态获取）

**获取方式**：直接调用后端 API

```javascript
// src/openai/openai-core.js 第 144-154 行
async listModels() {
    try {
        const response = await this.axiosInstance.get('/models');
        return response.data;
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error(`Error listing OpenAI models (Status: ${status}):`, data || error.message);
        throw error;
    }
}
```

**特点**：
- ✅ 实时调用 OpenAI API 的 `/models` 端点
- ✅ 返回所有该 API Key 能访问的模型
- ✅ 如果 API Key 权限不同，显示的模型可能不同
- ✅ 支持新模型自动发现（无需更新代码）

**返回格式**：OpenAI 标准格式
```json
{
    "object": "list",
    "data": [
        {
            "id": "gpt-4",
            "object": "model",
            "created": 1687882411,
            "owned_by": "openai"
        },
        {
            "id": "gpt-3.5-turbo",
            "object": "model",
            ...
        }
    ]
}
```

---

### 2️⃣ OpenAI Responses（动态获取）

**获取方式**：直接调用后端 API

```javascript
// src/openai/openai-responses-core.js 第 135-145 行
async listModels() {
    try {
        const response = await this.axiosInstance.get('/models');
        return response.data;
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error(`Error listing OpenAI Responses models (Status: ${status}):`, 
                      data || error.message);
        throw error;
    }
}
```

**特点**：
- ✅ 与 OpenAI Custom 类似，但使用 Responses API
- ✅ 实时调用后端 `/models` 端点
- ✅ 支持自动发现新模型

**返回格式**：OpenAI Responses 格式（可能与标准 OpenAI 略有不同）

---

### 3️⃣ Gemini CLI OAuth（固定模型列表）

**获取方式**：硬编码模型列表

```javascript
// src/gemini/gemini-core.js 第 17-18 行
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-2.5-pro-preview-06-05',
    'gemini-2.5-flash-preview-09-2025',
    'gemini-3-pro-preview-11-2025'
];

// src/gemini/gemini-core.js 第 314-315 行
async listModels() {
    this.availableModels = GEMINI_MODELS;
    console.log(`[Gemini] Using fixed models: [${this.availableModels.join(', ')}]`);
}
```

**特点**：
- ❌ 使用硬编码的模型列表
- ❌ 无法自动发现 Gemini 新发布的模型
- ✅ 模型始终保持一致（不会变化）
- ⚠️ 需要手动更新代码才能支持新模型

**返回格式**：Gemini 格式
```json
{
    "models": [
        {
            "name": "gemini-2.5-flash",
            "displayName": "[Gemini CLI] gemini-2.5-flash"
        },
        {
            "name": "gemini-2.5-pro",
            "displayName": "[Gemini CLI] gemini-2.5-pro"
        }
    ]
}
```

---

### 4️⃣ Claude Custom（固定模型列表）

**获取方式**：硬编码模型列表

```javascript
// src/claude/claude-core.js 第 194-210 行
async listModels() {
    console.log('[ClaudeApiService] Listing available models.');
    // Claude API 没有直接的 /models 端点来列出所有模型。
    // 通常，你需要根据 Anthropic 的文档硬编码你希望支持的模型。
    const models = [
        { id: "claude-4-sonnet", name: "claude-4-sonnet" },
        { id: "claude-sonnet-4-20250514", name: "claude-sonnet-4-20250514" },
        { id: "claude-opus-4-20250514", name: "claude-opus-4-20250514" },
        { id: "claude-3-7-sonnet-20250219", name: "claude-3-7-sonnet-20250219" },
        { id: "claude-3-5-sonnet-20241022", name: "claude-3-5-sonnet-20241022" },
        { id: "claude-3-5-haiku-20241022", name: "claude-3-5-haiku-20241022" },
        { id: "claude-3-opus-20240229", name: "claude-3-opus-20240229" },
        { id: "claude-3-haiku-20240307", name: "claude-3-haiku-20240307" },
    ];

    return { models: models.map(m => ({ name: m.name })) };
}
```

**特点**：
- ❌ Claude 官方 API 没有 `/models` 端点
- ❌ 使用硬编码的模型列表
- ❌ 需要手动维护支持的模型列表
- ✅ 列表完全受控

**原因**：Anthropic Claude API 不像 OpenAI API 一样提供模型列表端点，所以必须硬编码

**返回格式**：Claude 格式
```json
{
    "models": [
        { "name": "claude-3-5-sonnet-20241022" },
        { "name": "claude-opus-4-20250514" }
    ]
}
```

---

### 5️⃣ Claude Kiro OAuth（静态映射表）

**获取方式**：从模型映射表提取

```javascript
// src/claude/claude-kiro.js 第 23-30 行
const MODEL_MAPPING = {
    "claude-sonnet-4-5": "CLAUDE_SONNET_4_5_20250929_V1_0",
    "claude-sonnet-4-5-20250929": "CLAUDE_SONNET_4_5_20250929_V1_0",
    "claude-sonnet-4-20250514": "CLAUDE_SONNET_4_20250514_V1_0",
    "claude-3-7-sonnet-20250219": "CLAUDE_3_7_SONNET_20250219_V1_0",
    "amazonq-claude-sonnet-4-20250514": "CLAUDE_SONNET_4_20250514_V1_0",
    "amazonq-claude-3-7-sonnet-20250219": "CLAUDE_3_7_SONNET_20250219_V1_0"
};

// src/claude/claude-kiro.js 第 1116-1121 行
async listModels() {
    const models = Object.keys(MODEL_MAPPING).map(id => ({
        name: id
    }));
    
    return { models: models };
}
```

**特点**：
- ❌ 从 `MODEL_MAPPING` 表中提取模型列表
- ✅ 映射表便于管理模型和其 Kiro ID
- ❌ 需要手动更新映射表才能支持新模型
- 📝 映射表包含 8 个模型

**返回格式**：Claude 格式（Kiro 模式）
```json
{
    "models": [
        { "name": "claude-sonnet-4-5" },
        { "name": "claude-sonnet-4-20250514" },
        { "name": "claude-3-7-sonnet-20250219" }
    ]
}
```

---

### 6️⃣ Qwen OAuth（固定模型列表）

**获取方式**：硬编码模型列表

```javascript
// src/openai/qwen-core.js 第 13-16 行
const QWEN_MODEL_LIST = [
    { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus' },
    { id: 'qwen3-coder-flash', name: 'Qwen3 Coder Flash' },
];

// src/openai/qwen-core.js 第 605-609 行
async listModels() {
    // Return the predefined models for Qwen
    return {
        data: QWEN_MODEL_LIST
    };
}
```

**特点**：
- ❌ 使用硬编码的模型列表（只有 2 个模型）
- ❌ 无法自动发现新模型
- ✅ 模型列表简洁明了
- 📝 目前仅支持 Qwen3 Coder 系列

**返回格式**：OpenAI 格式（但用 `data` 而不是完整格式）
```json
{
    "data": [
        { "id": "qwen3-coder-plus", "name": "Qwen3 Coder Plus" },
        { "id": "qwen3-coder-flash", "name": "Qwen3 Coder Flash" }
    ]
}
```

---

## 📈 实现对比

### 动态 vs 静态

| 方案 | 优点 | 缺点 | 适用场景 |
|-----|------|------|---------|
| **动态获取**<br/>（OpenAI/Responses） | ✅ 自动支持新模型<br/>✅ 实时同步<br/>✅ 无需维护 | ❌ 依赖 API 响应<br/>❌ 性能略低 | API 原生支持<br/>模型频繁更新 |
| **静态列表**<br/>（Gemini/Claude/Qwen） | ✅ 性能好<br/>✅ 可控<br/>✅ 无依赖 | ❌ 需要手动更新<br/>❌ 可能遗漏新模型 | API 无模型端点<br/>模型变化不频繁 |
| **映射表**<br/>（Kiro） | ✅ 便于维护映射关系<br/>✅ 清晰明了 | ❌ 需要手动维护 | 需要内部映射<br/>模型数量有限 |

---

## 🔄 模型列表在负载均衡中的行为

### OpenAI Custom 示例

假设配置了 3 个不同的 API Key：

```json
{
  "openai-custom": [
    { "uuid": "key1", "OPENAI_API_KEY": "sk-key1-xxx", "isHealthy": true },
    { "uuid": "key2", "OPENAI_API_KEY": "sk-key2-yyy", "isHealthy": true },
    { "uuid": "key3", "OPENAI_API_KEY": "sk-key3-zzz", "isHealthy": true }
  ]
}
```

**模型列表请求时的行为**：
```
GET /v1/models
  ↓
只使用 key1 调用 OpenAI API
  ↓
返回 key1 可用的模型列表
  ↓
❌ key2 和 key3 的模型不会被显示
```

**API 请求时的行为**：
```
POST /v1/chat/completions (request 1)
  ↓ selectProvider() → 轮询选择 → key1
  
POST /v1/chat/completions (request 2)
  ↓ selectProvider() → 轮询选择 → key2
  
POST /v1/chat/completions (request 3)
  ↓ selectProvider() → 轮询选择 → key3
  
✅ 负载均衡分配给所有 key
```

---

## 📝 模型列表请求路由

### 端点映射

| 请求路径 | 格式类型 | 处理器 | 涉及提供商 |
|---------|--------|-------|-----------|
| `GET /v1/models` | OpenAI | handleModelListRequest | OpenAI Custom, OpenAI Responses |
| `GET /v1beta/models` | Gemini | handleModelListRequest | Gemini CLI OAuth |
| `GET /api/tags` | Ollama | handleOllamaTags | 所有提供商 |

### handleOllamaTags 的特殊处理

`src/ollama-handler.js:16-74` 中的 `handleOllamaTags()` 与 `handleModelListRequest()` 不同：

```javascript
// 与 handleModelListRequest 相同的问题：只使用第一个健康提供商
const healthyProvider = providers.find(p => p.isHealthy);
if (healthyProvider) {
    const tempConfig = { ...currentConfig, ...healthyProvider, MODEL_PROVIDER: providerType };
    const service = getServiceAdapter(tempConfig);
    fetchPromises.push(fetchProviderModels(providerType, service));
}
```

---

## 🎯 为什么不同提供商使用不同策略？

### 1. OpenAI & OpenAI Responses
**使用 API 动态获取**：
- ✅ OpenAI 官方 API 提供 `/models` 端点
- ✅ 可以实时获取权限和模型列表
- ✅ 新模型发布自动可用

### 2. Gemini
**使用固定列表**：
- ❌ Gemini API 没有 `/models` 端点
- ✅ 但提供官方文档的模型列表
- ✅ 模型变化相对不频繁
- 📝 当前支持 6 个 gemini-2.5+ 和 gemini-3 模型

### 3. Claude Custom
**使用固定列表**：
- ❌ Claude API（官方）没有 `/models` 端点
- ❌ Anthropic 不提供模型列表接口
- 📝 需要从 Anthropic 文档中查找支持的模型

### 4. Claude Kiro
**使用映射表**：
- ❌ Kiro/Amazon Q 没有标准 `/models` 端点
- 📝 需要维护 Kiro 内部模型 ID 的映射
- 📝 当前支持 6 个 Claude Sonnet 和 3.7 Sonnet 模型

### 5. Qwen
**使用固定列表**：
- ❌ Qwen OAuth 没有模型列表端点
- 📝 仅需要支持有限的 Qwen3 Coder 模型
- 📝 目前支持 2 个模型

---

## 📊 模型支持情况统计

| 提供商 | 当前模型数 | 获取方式 | 最后更新 |
|-------|----------|--------|---------|
| OpenAI | 动态 | API 查询 | 实时 |
| OpenAI Responses | 动态 | API 查询 | 实时 |
| Gemini | 6 | 代码常量 | v17 |
| Claude Custom | 8 | 代码常量 | v8 |
| Claude Kiro | 6 | 映射表 | 支持 sonnet-4 |
| Qwen | 2 | 代码常量 | qwen3 only |

---

## 🔧 如何添加新模型

### 动态获取（无需修改代码）
**OpenAI Custom** 和 **OpenAI Responses**：
- ✅ 新模型自动可用
- 无需任何代码修改

### 固定列表（需要代码修改）

#### Gemini 添加新模型
```javascript
// src/gemini/gemini-core.js
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3-pro-preview-11-2025',
    'gemini-4-0-experimental', // 新增
];
```

#### Claude Custom 添加新模型
```javascript
// src/claude/claude-core.js
async listModels() {
    const models = [
        { id: "claude-3-7-sonnet-20250219", name: "claude-3-7-sonnet-20250219" },
        { id: "claude-4-0-20250101", name: "claude-4-0-20250101" }, // 新增
        ...
    ];
    return { models: models.map(m => ({ name: m.name })) };
}
```

#### Kiro 添加新模型
```javascript
// src/claude/claude-kiro.js
const MODEL_MAPPING = {
    ...existingModels,
    "claude-4-0": "CLAUDE_4_0_V1_0", // 新增
};
```

#### Qwen 添加新模型
```javascript
// src/openai/qwen-core.js
const QWEN_MODEL_LIST = [
    { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus' },
    { id: 'qwen3-coder-flash', name: 'Qwen3 Coder Flash' },
    { id: 'qwen4-code-128k', name: 'Qwen4 Code 128K' }, // 新增
];
```

---

## 💡 改进建议

### 短期改进
1. 更新 Gemini 模型列表到最新版本
2. 添加 Claude 新模型（如 Claude 4.0）
3. 扩展 Qwen 模型列表

### 中期改进
1. **考虑为 Gemini 添加 API 查询**
   - Google 可能在某些情况下提供模型列表
   - 可以与固定列表作为备选

2. **为 Claude 添加官方模型获取**
   - 监听 Anthropic 官方公告
   - 自动更新模型列表

3. **统一模型列表管式**
   - 将固定模型列表外部化为 JSON 文件
   - 便于运行时加载和更新

### 长期改进
1. 实现模型列表版本管理
2. 添加模型废弃和迁移提示
3. 实现模型能力查询接口（如支持 vision、function_calling 等）

---

## 总结

| 提供商 | 方式 | 特点 | 依赖 |
|-------|------|------|------|
| **OpenAI Custom** | ✅ 动态 API | 自动最新 | OpenAI API |
| **OpenAI Responses** | ✅ 动态 API | 自动最新 | OpenAI API |
| **Gemini** | ❌ 固定列表 | 需手动更新 | 无 |
| **Claude Custom** | ❌ 固定列表 | 需手动维护 | 无 |
| **Claude Kiro** | ❌ 映射表 | 映射关系清晰 | Kiro API |
| **Qwen** | ❌ 固定列表 | 简洁有限 | 无 |

---

## 📚 文件位置速查

```
模型列表相关文件：
├── src/openai/openai-core.js (144-154)           // OpenAI 动态获取
├── src/openai/openai-responses-core.js (135-145) // OpenAI Responses 动态获取
├── src/gemini/gemini-core.js (17-18, 314-315)    // Gemini 固定列表
├── src/claude/claude-core.js (194-210)           // Claude 固定列表
├── src/claude/claude-kiro.js (23-30, 1116-1121)  // Kiro 映射表
├── src/openai/qwen-core.js (13-16, 605-609)      // Qwen 固定列表
├── src/common.js (615-764)                        // handleModelListRequest 路由
└── src/ollama-handler.js (16-74)                 // handleOllamaTags 路由
```
