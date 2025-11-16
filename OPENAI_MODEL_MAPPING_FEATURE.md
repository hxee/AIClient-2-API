# OpenAI Custom 模型映射功能设计

## 需求概述

为 OpenAI custom 提供商添加模型映射功能，允许用户在 UI 上配置供应商的真实模型映射到 models.config中配置
openai-custom渠道中的models

## 使用场景

**示例：**
- 供应商 x666 设置：`gpt-4-turbo` → 映射到 `glm-4.6`
- 供应商 deepseek 设置：`deepseek-chat` → 映射到 `gemini-2.5-flash`

当用户请求 `glm-4.6` 时，系统会根据负载均衡或轮询策略，选择可用的供应商（x666 或 deepseek），并使用其映射的真实模型名称发起请求。

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
        "glm-4.6": "gpt-4-turbo",
        "gemini-2.5-flash": "gpt-3.5-turbo",
        "xxx": "claude-3-opus"
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
        "glm-4.6": "deepseek-chat",
        "gemini-2.5-flash": "deepseek-coder",
          "xxx": "deepseek-3.2"
      },
      "isHealthy": true,
      "isDisabled": false
    }
  ]
}
```

