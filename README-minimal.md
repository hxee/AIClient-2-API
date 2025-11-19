# Minimal OpenAI Proxy

一个超精简的 OpenAI API 代理服务，专注于核心功能。

## ✨ 特性

- 🚀 **轻量高效** - 删除了70%的冗余代码，启动时间 <0.5秒
- 🔄 **直接转发** - `/v1/chat/completions` 直接转发到上游 OpenAI
- 🔀 **协议转换** - `/v1/messages` Claude格式自动转换为OpenAI格式
- 📋 **模型列表** - `/v1/models` 从上游获取完整模型列表
- 🔑 **简单认证** - 支持 Bearer Token 认证

## 📦 安装

```bash
# 克隆仓库
git clone <your-repo>
cd AIClient-2-API

# 切换到精简分支
git checkout minimal-openai-proxy

# 安装依赖
npm install
```

## 🚀 快速开始

### 1. 基本启动

```bash
node src/api-server.js \
  --openai-api-key YOUR_OPENAI_API_KEY \
  --openai-base-url https://api.openai.com/v1
```

### 2. 自定义配置

```bash
node src/api-server.js \
  --host 0.0.0.0 \
  --port 8080 \
  --api-key your-secret-key \
  --openai-api-key YOUR_OPENAI_API_KEY \
  --openai-base-url https://api.openai.com/v1
```

### 3. 使用配置文件

创建 `config.json`:

```json
{
  "HOST": "127.0.0.1",
  "SERVER_PORT": 3000,
  "REQUIRED_API_KEY": "admin123",
  "OPENAI_API_KEY": "sk-your-key",
  "OPENAI_BASE_URL": "https://api.openai.com/v1",
  "PROMPT_LOG_MODE": "console"
}
```

然后直接启动：

```bash
node src/api-server.js
```

## 🌐 API 端点

### GET /v1/models
获取上游可用的模型列表

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer admin123"
```

### POST /v1/chat/completions
OpenAI 聊天完成 (直接转发)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer admin123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

### POST /v1/messages
Claude 消息 (转换为OpenAI格式后转发)

```bash
curl http://localhost:3000/v1/messages \
  -H "Authorization: Bearer admin123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 1024
  }'
```

### GET /health
健康检查

```bash
curl http://localhost:3000/health
```

## ⚙️ 配置选项

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--host` | 服务器监听地址 | `localhost` |
| `--port` | 服务器监听端口 | `3000` |
| `--api-key` | 客户端认证密钥 | `123456` |
| `--openai-api-key` | 上游 OpenAI API 密钥 | - |
| `--openai-base-url` | 上游 OpenAI API 地址 | `https://api.openai.com/v1` |
| `--system-prompt-file` | 系统提示文件路径 | `input_system_prompt.txt` |
| `--system-prompt-mode` | 系统提示模式 | `append` |
| `--log-prompts` | 提示日志模式 | `none` |

## 📂 项目结构

```
src/
├── api-server.js           # 服务器入口
├── request-handler.js      # 请求处理
├── api-manager.js          # API路由
├── config-manager.js       # 配置管理
├── service-manager.js      # 服务管理
├── adapter.js              # 服务适配器
├── common.js               # 通用工具
├── convert.js              # 协议转换
├── converters/             # 转换器
│   ├── BaseConverter.js
│   ├── ConverterFactory.js
│   ├── register-converters.js
│   ├── utils.js
│   └── strategies/
│       └── ClaudeConverter.js
└── openai/                 # OpenAI实现
    ├── openai-core.js
    └── openai-strategy.js
```

## 🔒 认证

所有 API 端点（除了 `/health`）都需要认证：

```bash
# 使用 Authorization Bearer Token
curl -H "Authorization: Bearer your-api-key" http://localhost:3000/v1/models
```

## 📊 与完整版对比

| 项目 | 完整版 | 精简版 | 优化 |
|------|--------|--------|------|
| 文件数量 | ~35 | ~15 | **57% ↓** |
| 代码行数 | ~5000+ | ~1800 | **64% ↓** |
| 启动时间 | ~2s | <0.5s | **75% ↓** |
| 支持的提供商 | 多个 | OpenAI | 专注核心 |
| UI管理界面 | ✅ | ❌ | 减少复杂度 |
| 提供商池 | ✅ | ❌ | 简化架构 |
| 健康检查 | ✅ | 基础版 | 保留必要 |

## 🛠️ 开发

### 运行测试

```bash
npm test
```

### 调试模式

```bash
# 启用详细日志
node src/api-server.js --log-prompts console
```

## 📝 常见问题

### Q: 如何更改上游地址？
A: 使用 `--openai-base-url` 参数或在 `config.json` 中设置 `OPENAI_BASE_URL`

### Q: Claude 格式如何转换？
A: 自动使用 `ClaudeConverter` 将 Claude Messages API 格式转换为 OpenAI Chat Completions 格式

### Q: 支持流式响应吗？
A: 是的，两个端点都支持 `stream: true` 参数

### Q: 如何添加系统提示？
A: 创建 `input_system_prompt.txt` 文件或使用 `--system-prompt-file` 指定

## 📄 许可证

Apache-2.0

## 🙏 致谢

基于原始的多提供商API代理项目精简而来。

---

**需要完整功能？** 切换回 `main` 分支以使用完整版本。
