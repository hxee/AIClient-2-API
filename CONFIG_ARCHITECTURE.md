# 配置架构说明

## 概述

本项目已完成配置分离重构，将基础配置和凭据管理完全分离，实现更清晰的架构和更强大的负载均衡能力。

## 配置文件职责

### 1. config.json - 基础配置（只读）

`config.json` 现在**仅包含**基础服务器配置，**不再包含**任何 API keys、OAuth 凭据等敏感信息。

**包含的字段：**
```json
{
  "REQUIRED_API_KEY": "123456",          // 访问本服务的 API Key
  "SERVER_PORT": 3000,                   // 服务器端口
  "HOST": "127.0.0.1",                   // 服务器主机地址
  "SYSTEM_PROMPT_FILE_PATH": "input_system_prompt.txt",  // 系统提示词文件路径
  "SYSTEM_PROMPT_MODE": "overwrite",     // 系统提示词模式
  "PROMPT_LOG_BASE_NAME": "prompt_log",  // 提示词日志基础名称
  "PROMPT_LOG_MODE": "none",             // 日志模式
  "REQUEST_MAX_RETRIES": 3,              // 最大重试次数
  "REQUEST_BASE_DELAY": 1000,            // 基础延迟
  "CRON_NEAR_MINUTES": 1,                // Cron 时间窗口
  "CRON_REFRESH_TOKEN": false,           // 是否自动刷新 token
  "PROVIDER_POOLS_FILE_PATH": "provider_pools.json"  // 提供商池配置文件路径
}
```

**已移除的字段：**
- ❌ `MODEL_PROVIDER` - 自动检测
- ❌ `OPENAI_API_KEY` - 移至 provider_pools.json
- ❌ `OPENAI_BASE_URL` - 移至 provider_pools.json
- ❌ `CLAUDE_API_KEY` - 移至 provider_pools.json
- ❌ `CLAUDE_BASE_URL` - 移至 provider_pools.json
- ❌ `PROJECT_ID` - 移至 provider_pools.json
- ❌ `GEMINI_OAUTH_CREDS_BASE64` - 移至 provider_pools.json
- ❌ `GEMINI_OAUTH_CREDS_FILE_PATH` - 移至 provider_pools.json
- ❌ `KIRO_OAUTH_CREDS_BASE64` - 移至 provider_pools.json
- ❌ `KIRO_OAUTH_CREDS_FILE_PATH` - 移至 provider_pools.json
- ❌ `QWEN_OAUTH_CREDS_FILE_PATH` - 移至 provider_pools.json

### 2. provider_pools.json - 凭据管理和负载均衡

`provider_pools.json` **统一管理**所有提供商的凭据配置，支持多账号负载均衡。

**架构特点：**
- ✅ 按提供商类型分组（如 `openai-custom`, `claude-custom`, `gemini-cli-oauth`）
- ✅ 每个类型可配置多个凭据，实现负载均衡
- ✅ 自动健康检查和状态跟踪
- ✅ 支持启用/禁用单个凭据
- ✅ 轮询调度，自动切换凭据

**示例结构：**
```json
{
  "gemini-cli-oauth": [
    {
      "GEMINI_OAUTH_CREDS_FILE_PATH": "./configs/gemini/creds1.json",
      "PROJECT_ID": "project-1",
      "checkModelName": null,
      "checkHealth": true,
      "uuid": "ac200154-26b8-4f5f-8650-e8cc738b06e3",
      "isHealthy": true,
      "isDisabled": false,
      "lastUsed": null,
      "usageCount": 0,
      "errorCount": 0,
      "lastErrorTime": null
    },
    {
      "GEMINI_OAUTH_CREDS_FILE_PATH": "./configs/gemini/creds2.json",
      "PROJECT_ID": "project-2",
      "checkModelName": null,
      "checkHealth": true,
      "uuid": "4f8afcc2-a9bb-4b96-bb50-3b9667a71f54",
      "isHealthy": true,
      "isDisabled": false,
      "lastUsed": null,
      "usageCount": 0,
      "errorCount": 0,
      "lastErrorTime": null
    }
  ],
  "openai-custom": [
    {
      "OPENAI_API_KEY": "sk-key1",
      "OPENAI_BASE_URL": "https://api.openai.com/v1",
      "checkModelName": null,
      "checkHealth": true,
      "uuid": "2f579c65-d3c5-41b1-9985-9f6e3d7bf39c",
      "isHealthy": true,
      "isDisabled": false,
      "lastUsed": null,
      "usageCount": 0,
      "errorCount": 0,
      "lastErrorTime": null
    }
  ]
}
```

## 工作流程

### 启动流程

1. **加载 config.json**
   - 读取基础配置参数
   - 获取 `PROVIDER_POOLS_FILE_PATH`

2. **加载 provider_pools.json**
   - 读取所有提供商凭据配置
   - 初始化 ProviderPoolManager

3. **自动检测可用提供商**
   - 扫描所有提供商类型
   - 识别健康且启用的凭据
   - 设置 `DEFAULT_MODEL_PROVIDERS` 列表

4. **输出日志**
   ```
   [Config] Auto-detected available providers: gemini-cli-oauth, openai-custom
   [gemini-cli-oauth] Pool: 2 credential(s), 2 available for load balancing
     - Credential #1 [ac200154...]: healthy, used 0 times
     - Credential #2 [4f8afcc2...]: healthy, used 0 times
   ```

### 请求处理流程

1. **接收 API 请求**
2. **ProviderPoolManager 选择凭据**
   - 使用轮询（Round-Robin）算法
   - 只选择健康且启用的凭据
   - 更新使用统计

3. **发起 AI 服务请求**
   - 使用选中的凭据
   - 记录使用次数

4. **错误处理**
   - 发生错误时标记凭据
   - 错误次数达到阈值后标记为不健康
   - 自动切换到下一个健康凭据

5. **健康检查**
   - 定期检查不健康的凭据
   - 恢复健康后重新加入轮询

## 负载均衡策略

### 单提供商多凭据（负载均衡）

**场景**: 同一个提供商类型有多个 auth/key

```json
{
  "gemini-cli-oauth": [
    { "GEMINI_OAUTH_CREDS_FILE_PATH": "./creds1.json", "uuid": "..." },
    { "GEMINI_OAUTH_CREDS_FILE_PATH": "./creds2.json", "uuid": "..." },
    { "GEMINI_OAUTH_CREDS_FILE_PATH": "./creds3.json", "uuid": "..." }
  ]
}
```

**行为**:
- ✅ 请求 1 → 使用 creds1
- ✅ 请求 2 → 使用 creds2
- ✅ 请求 3 → 使用 creds3
- ✅ 请求 4 → 使用 creds1（轮询）

### 多提供商支持

**场景**: 同时配置多个不同的提供商类型

```json
{
  "gemini-cli-oauth": [ /* Gemini 凭据 */ ],
  "openai-custom": [ /* OpenAI 凭据 */ ],
  "claude-custom": [ /* Claude 凭据 */ ]
}
```

**行为**:
- ✅ 所有配置的提供商类型都会被自动检测
- ✅ 每个类型独立进行负载均衡
- ✅ 可通过 WebUI 或 API 管理每个类型

## WebUI 使用

### 添加新凭据

1. 访问 WebUI 的"提供商池管理"页面
2. 选择提供商类型（如 `gemini-cli-oauth`）
3. 填写凭据信息
4. 点击"添加" - 自动保存到 `provider_pools.json`
5. 系统自动检测并启用新凭据

### 管理现有凭据

- **查看状态**: 显示健康状态、使用次数、错误次数
- **启用/禁用**: 临时禁用凭据而不删除
- **删除**: 从池中移除凭据
- **编辑**: 修改凭据配置

### 上传凭据文件

1. 在"上传配置"页面选择文件
2. 选择对应的提供商类型
3. 文件自动保存到 `configs/<provider>/` 目录
4. 在提供商池中引用该文件路径

## API 端点

### 获取提供商池信息
```
GET /api/providers
```

### 获取特定类型的提供商
```
GET /api/providers/{providerType}
```

### 添加新提供商凭据
```
POST /api/providers
Body: {
  "providerType": "gemini-cli-oauth",
  "providerConfig": {
    "GEMINI_OAUTH_CREDS_FILE_PATH": "./creds.json",
    "PROJECT_ID": "my-project"
  }
}
```

### 更新提供商凭据
```
PUT /api/providers/{providerType}/{uuid}
```

### 删除提供商凭据
```
DELETE /api/providers/{providerType}/{uuid}
```

### 启用/禁用提供商凭据
```
POST /api/providers/{providerType}/{uuid}/enable
POST /api/providers/{providerType}/{uuid}/disable
```

## 迁移指南

### 从旧配置迁移

如果你有旧的 `config.json`，按以下步骤迁移：

1. **备份现有配置**
   ```bash
   cp config.json config.json.backup
   ```

2. **创建 provider_pools.json**
   ```bash
   cp provider_pools.json.example provider_pools.json
   ```

3. **将凭据移至 provider_pools.json**
   - 从 `config.json` 复制 API keys 和 OAuth 凭据
   - 粘贴到 `provider_pools.json` 对应的提供商类型下
   - 为每个凭据生成 UUID

4. **更新 config.json**
   - 使用新的 `config.json.example` 作为模板
   - 只保留基础配置字段
   - 移除所有 key/auth 字段

5. **重启服务**
   ```bash
   npm start
   ```

6. **验证配置**
   - 检查启动日志中的提供商检测信息
   - 访问 WebUI 查看提供商池状态

## 优势

### 1. 清晰的职责分离
- **config.json**: 纯基础配置
- **provider_pools.json**: 纯凭据管理

### 2. 强大的负载均衡
- 同一提供商多个凭据轮询使用
- 自动健康检查和故障转移
- 实时统计使用情况

### 3. 灵活的管理
- WebUI 可视化管理
- 支持动态添加/删除/启用/禁用
- 无需重启服务

### 4. 更好的安全性
- 凭据集中管理
- 可独立备份凭据文件
- 支持文件级权限控制

### 5. 可扩展性
- 轻松添加新的提供商类型
- 支持无限数量的凭据
- 模块化架构便于维护

## 故障排除

### 问题: 提供商未被检测

**检查**:
1. `provider_pools.json` 是否存在
2. 凭据配置是否正确
3. `isHealthy` 和 `isDisabled` 状态
4. 查看启动日志

### 问题: 负载均衡不工作

**检查**:
1. 是否有多个健康的凭据
2. 查看每个凭据的 `usageCount`
3. 检查 `errorCount` 是否过高

### 问题: 配置更改未生效

**解决**:
1. 通过 WebUI 点击"重新加载配置"
2. 或重启服务

## 最佳实践

1. **定期备份** `provider_pools.json`
2. **使用健康检查** 设置 `checkHealth: true`
3. **监控错误率** 关注 `errorCount` 和 `lastErrorTime`
4. **合理设置重试** 调整 `REQUEST_MAX_RETRIES`
5. **使用文件路径** 而非 Base64，便于管理
6. **分类存储凭据文件** 使用 `configs/<provider>/` 目录结构

## 技术细节

### 自动提供商检测算法

```javascript
// 扫描 provider_pools.json 中的所有提供商类型
for (const [providerType, providers] of Object.entries(providerPools)) {
  // 检查是否有至少一个健康且启用的凭据
  const hasAvailableProvider = providers.some(p => 
    p.isHealthy !== false && p.isDisabled !== true
  );
  
  if (hasAvailableProvider && providers.length > 0) {
    availableProviders.push(providerType);
  }
}
```

### 轮询选择算法

```javascript
// Round-Robin 算法
const currentIndex = this.roundRobinIndex[providerType] || 0;
const providerIndex = currentIndex % availableProviders.length;
const selected = availableProviders[providerIndex];

// 更新下次索引
this.roundRobinIndex[providerType] = (providerIndex + 1) % availableProviders.length;
```

---

**文档版本**: 1.0  
**最后更新**: 2025-11-15  
**维护者**: AnyAI-2-Open-API Team

## 新版本改进 (v2.0)

### 自动添加凭据功能

**问题**: 旧版本中，上传凭据文件和添加到 `provider_pools.json` 是两个独立的步骤，导致：
- 用户需要先上传文件
- 然后手动点击"添加新提供商"
- 再填写表单引用上传的文件路径
- 最后保存才能完成配置

**解决方案**: 现在上传文件后自动添加到凭据池，一步完成！

**工作流程**：
1. 用户在 WebUI 选择提供商类型并点击上传按钮
2. 选择凭据文件
3. 文件自动上传到 `configs/<provider>/` 目录
4. **系统自动创建提供商配置**：
   - 生成唯一 UUID
   - 设置凭据文件路径
   - 初始化默认配置（健康检查、统计数据等）
5. **自动写入 `provider_pools.json`**
6. **自动刷新内存中的提供商池**
7. **WebUI 自动更新显示新添加的提供商**

**技术实现**：

后端接口改进（`src/ui-manager.js`）：
```javascript
POST /api/upload-oauth-credentials
参数：
- file: 凭据文件
- provider: 提供商标识 (gemini/kiro/qwen)
- providerType: 提供商类型 (gemini-cli-oauth/claude-kiro-oauth/openai-qwen-oauth)

返回示例：
{
  "success": true,
  "message": "文件上传成功并已自动添加到凭据池",
  "filePath": "configs/gemini/1234567890_credentials.json",
  "addedToPool": true,
  "providerConfig": {
    "uuid": "abc123-...",
    "GEMINI_OAUTH_CREDS_FILE_PATH": "configs/gemini/1234567890_credentials.json",
    "PROJECT_ID": "",
    "checkHealth": false,
    "isHealthy": true,
    ...
  }
}
```

前端改进（`static/app/file-upload.js`）：
```javascript
// 自动检测当前提供商类型
const providerType = this.getCurrentProviderType(button);

// 上传时传递提供商类型
formData.append('providerType', providerType);

// 上传成功后自动刷新界面
if (result.addedToPool) {
    await window.loadProviders();  // 刷新提供商列表
    showToast('文件上传成功并已自动添加到凭据池', 'success');
}
```

### 改进效果对比

**旧流程**（4步操作）：
1. ❌ 上传文件 → 仅保存文件
2. ❌ 点击"添加新提供商"
3. ❌ 手动填写文件路径和其他字段
4. ❌ 点击保存

**新流程**（1步操作）：
1. ✅ 上传文件 → **自动完成所有配置** 🎉

### 支持的提供商类型

自动添加功能支持以下提供商类型：
- ✅ `gemini-cli-oauth` - 设置 `GEMINI_OAUTH_CREDS_FILE_PATH`
- ✅ `claude-kiro-oauth` - 设置 `KIRO_OAUTH_CREDS_FILE_PATH`
- ✅ `openai-qwen-oauth` - 设置 `QWEN_OAUTH_CREDS_FILE_PATH`

### 兼容性说明

- 如果上传时未指定 `providerType`，文件仍会正常上传，但不会自动添加到池中
- 仍然保留手动添加功能，适用于不需要文件上传的提供商（如 API Key 类型）
- 现有的 `provider_pools.json` 完全兼容，无需修改

### 配置完全分离

**改进**：
- ✅ `config.json`：仅包含基础配置（端口、日志、系统提示等）
- ✅ `provider_pools.json`：统一管理所有 API keys 和 OAuth 凭据
- ✅ 删除文件时不影响基础配置
- ✅ 自动提供商检测，无需手动配置 `MODEL_PROVIDER`

### 用户体验提升

1. **简化操作流程**：从4步减少到1步
2. **减少错误**：无需手动输入文件路径，避免拼写错误
3. **即时反馈**：上传后立即看到新提供商出现在列表中
4. **自动配置**：UUID、健康状态等字段自动生成
5. **智能识别**：根据上下文自动识别提供商类型

---

**文档版本**: 2.0  
**最后更新**: 2025-11-15  
**新增功能**: 自动凭据添加、配置完全分离  
**维护者**: AnyAI-2-Open-API Team