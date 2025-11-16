# 各渠道模型列表获取方式 - 快速参考

## 📋 一句话总结

| 渠道 | 获取方式 | 数据来源 |
|-----|--------|--------|
| **OpenAI** | 📡 API 调用 | 后端 API `/models` 端点 |
| **OpenAI Responses** | 📡 API 调用 | 后端 API `/models` 端点 |
| **Gemini** | 📝 硬编码 | 源码常量 `GEMINI_MODELS` |
| **Claude** | 📝 硬编码 | 源码常量（无 API 端点） |
| **Claude Kiro** | 📊 映射表 | 源码 `MODEL_MAPPING` |
| **Qwen** | 📝 硬编码 | 源码常量 `QWEN_MODEL_LIST` |

---

## 🔍 详细对比

### OpenAI & OpenAI Responses（✅ 动态）

```
请求 GET /v1/models
  ↓
调用后端 API 的 /models 端点
  ↓
返回该 API Key 能访问的所有模型
  ↓
优点：自动发现新模型，无需更新代码
缺点：依赖 API 响应，可能较慢
```

**代码位置**：
- OpenAI: `src/openai/openai-core.js:144-154`
- Responses: `src/openai/openai-responses-core.js:135-145`

**返回示例**：
```javascript
{
  "object": "list",
  "data": [
    { "id": "gpt-4", "object": "model", ... },
    { "id": "gpt-3.5-turbo", "object": "model", ... }
  ]
}
```

---

### Gemini（❌ 静态）

```
请求 GET /v1beta/models
  ↓
从源码常量中读取 GEMINI_MODELS
  ↓
返回固定的模型列表：
  - gemini-2.5-flash
  - gemini-2.5-pro
  - gemini-3-pro-preview-11-2025
  等 6 个模型
  ↓
优点：性能好，无外部依赖
缺点：需要手动更新代码才能支持新模型
```

**代码位置**：`src/gemini/gemini-core.js:17, 314-315`

**核心代码**：
```javascript
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3-pro-preview-11-2025'
    // ... 更多模型
];
```

**模型数量**：6 个

---

### Claude Custom（❌ 静态）

```
请求 GET /v1/models（通过转换）
  ↓
Claude API 本身没有 /models 端点！
  ↓
所以从源码常量中读取固定模型列表
  ↓
返回硬编码的 Claude 模型：
  - claude-3-7-sonnet-20250219
  - claude-3-5-sonnet-20241022
  - claude-opus-4-20250514
  等 8 个模型
  ↓
优点：完全可控，性能好
缺点：需要手动维护，新模型需要更新代码
```

**代码位置**：`src/claude/claude-core.js:194-210`

**核心代码**：
```javascript
async listModels() {
    const models = [
        { id: "claude-4-sonnet", name: "claude-4-sonnet" },
        { id: "claude-3-7-sonnet-20250219", name: "claude-3-7-sonnet-20250219" },
        // ... 更多模型
    ];
    return { models: models.map(m => ({ name: m.name })) };
}
```

**模型数量**：8 个

---

### Claude Kiro（❌ 映射表）

```
请求 GET /v1/models（通过转换）
  ↓
从 MODEL_MAPPING 映射表中提取模型名
  ↓
MODEL_MAPPING 将模型名映射到 Kiro 内部 ID：
  "claude-sonnet-4-5" → "CLAUDE_SONNET_4_5_20250929_V1_0"
  "claude-3-7-sonnet-20250219" → "CLAUDE_3_7_SONNET_20250219_V1_0"
  ↓
返回映射表中的所有模型
  ↓
优点：映射关系清晰易维护
缺点：需要手动更新映射表
```

**代码位置**：`src/claude/claude-kiro.js:23-30, 1116-1121`

**核心代码**：
```javascript
const MODEL_MAPPING = {
    "claude-sonnet-4-5": "CLAUDE_SONNET_4_5_20250929_V1_0",
    "claude-sonnet-4-20250514": "CLAUDE_SONNET_4_20250514_V1_0",
    "claude-3-7-sonnet-20250219": "CLAUDE_3_7_SONNET_20250219_V1_0",
    // ... 更多映射
};

async listModels() {
    const models = Object.keys(MODEL_MAPPING).map(id => ({ name: id }));
    return { models: models };
}
```

**模型数量**：6 个

---

### Qwen OAuth（❌ 静态）

```
请求 GET /v1/models
  ↓
从源码常量中读取 QWEN_MODEL_LIST
  ↓
返回固定的 Qwen 模型：
  - qwen3-coder-plus
  - qwen3-coder-flash
  ↓
优点：简洁清晰，目标明确
缺点：模型数量少（只有 2 个），需要手动更新
```

**代码位置**：`src/openai/qwen-core.js:13-16, 605-609`

**核心代码**：
```javascript
const QWEN_MODEL_LIST = [
    { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus' },
    { id: 'qwen3-coder-flash', name: 'Qwen3 Coder Flash' },
];

async listModels() {
    return { data: QWEN_MODEL_LIST };
}
```

**模型数量**：2 个

---

## 🎯 关键差异

### API 端点支持情况

| 提供商 | 是否提供 `/models` 端点 | 系统处理方式 |
|-------|----------------------|-----------|
| OpenAI | ✅ 是 | 直接调用 API |
| Claude（官方） | ❌ 否 | 硬编码列表 |
| Gemini | ❌ 否 | 硬编码列表 |
| Qwen | ❌ 否 | 硬编码列表 |
| Kiro | ❌ 否 | 映射表 |

### 模型更新周期

| 提供商 | 更新方式 | 周期 | 备注 |
|-------|--------|------|------|
| OpenAI | 自动 | 实时 | API 原生支持 |
| Claude | 手动 | 需修改代码 | 需要监听更新 |
| Gemini | 手动 | 需修改代码 | 需要监听更新 |
| Qwen | 手动 | 需修改代码 | 目前仅 2 个模型 |
| Kiro | 手动 | 需修改映射表 | 需要同步 Kiro 版本 |

---

## 🔧 模型列表的获取时机

所有模型列表请求都在以下情况下触发：

1. **客户端请求时**
   ```bash
   # OpenAI 格式
   curl GET "http://localhost:3000/v1/models" \
     -H "Authorization: Bearer key"
   
   # Gemini 格式
   curl GET "http://localhost:3000/v1beta/models" \
     -H "x-goog-api-key: key"
   
   # Ollama 格式
   curl GET "http://localhost:3000/api/tags" \
     -H "Authorization: Bearer key"
   ```

2. **路由匹配**
   - `/v1/models` → OpenAI/OpenAI Responses
   - `/v1beta/models` → Gemini
   - `/api/tags` → Ollama（所有提供商）

3. **服务适配器调用**
   - `apiService.listModels()` 被调用
   - 每个提供商实现不同的逻辑

---

## 📊 模型数量汇总

```
┌─────────────────────┬──────────┬────────────────┐
│ 提供商              │ 模型数   │ 获取方式       │
├─────────────────────┼──────────┼────────────────┤
│ OpenAI              │ 动态     │ API 查询       │
│ OpenAI Responses    │ 动态     │ API 查询       │
│ Gemini CLI          │ 6 个     │ 硬编码常量     │
│ Claude Custom       │ 8 个     │ 硬编码常量     │
│ Claude Kiro         │ 6 个     │ 映射表提取     │
│ Qwen OAuth          │ 2 个     │ 硬编码常量     │
└─────────────────────┴──────────┴────────────────┘
```

---

## ⚡ 性能对比

| 方案 | 响应时间 | 稳定性 | 可维护性 |
|-----|--------|-------|--------|
| **动态 API** | 较慢（100-500ms） | 一般（取决于网络） | 高（自动更新） |
| **硬编码** | 快速（<10ms） | 高（本地） | 低（需手动更新） |
| **映射表** | 快速（<10ms） | 高（本地） | 中等（需维护映射） |

---

## 🚀 最佳实践

### 使用 OpenAI Custom 时
- ✅ 模型列表会自动同步新模型
- ✅ 无需任何配置
- ✅ 支持多个 API Key

### 使用固定列表渠道时
- 📝 定期检查官方文档
- 📝 及时更新源码中的模型列表
- 📝 测试新模型是否正常工作

### 使用 Kiro 时
- 📊 维护好 `MODEL_MAPPING` 映射表
- 📊 同步 Kiro 官方发布的模型版本
- 📊 避免过期的模型映射

---

## 📚 相关文档

- 完整对比：[PROVIDER_MODEL_LIST_COMPARISON.md](./PROVIDER_MODEL_LIST_COMPARISON.md)
- 负载均衡：[LOAD_BALANCING_VISUAL_GUIDE.md](./LOAD_BALANCING_VISUAL_GUIDE.md)
- OpenAI 分析：[MODEL_LIST_AND_LOAD_BALANCING_ANALYSIS.md](./MODEL_LIST_AND_LOAD_BALANCING_ANALYSIS.md)
- 快速答案：[QUICK_ANSWER_MODEL_LIST_AND_LB.md](./QUICK_ANSWER_MODEL_LIST_AND_LB.md)
