# Repository Guidelines

## Project Structure & Module Organization
AIClient-2-API 以 `src/` 为核心，`api-server.js` 启动 HTTP 代理，`service-manager.js` 控制 Provider Pools，`request-handler.js` 负责路由，`ui-manager.js` 承载 Web 控制台。各提供商具体逻辑分布在 `src/openai|gemini|claude|qwen|converters` 等子目录。环境与账号样例在 `config.json`、`provider_pools.json` 以及 `configs/` 下，临时上传写入 `configs/temp/`。静态管理面板资源在 `static/`，截图与 UI 说明见 `UI_README.md`。集成测试位于 `tests/api-integration.test.js`，部署脚本位于根目录的 `install-and-run.*`、`run-docker.*` 和 `Dockerfile`。

## Build, Test, and Development Commands
Run `npm install` once to pull dependencies. .\install-and-run.bat（或 `bash install-and-run.sh`）会检查 Node、装包并以默认端口启动服务。需要手动运行时，使用 `NODE_ENV=development node src/api-server.js --config ./config.json --system-prompt-file ./input_system_prompt.txt`。基础测试通过 `npm test` 执行；`npx jest tests/api-integration.test.js` 针对运行中的服务器做全链路验证；`node run-tests.js --unit` 与 `--integration` 可只跑某一类用例。

## Coding Style & Naming Conventions
项目使用 ES Modules（`"type": "module"`），保持四空格缩进。文件名采用 `kebab-case.js`，类为 `PascalCase`，函数与变量使用 `camelCase`。HTTP 日志和错误信息应复用 `common.js`/`config-manager.js` 中的常量，新增配置统一挂载到 `CONFIG`。提交前请确保文件保存为 UTF-8，并避免混用 `require` 与 `import`。

## Testing Guidelines
Jest 是唯一测试框架，`@jest/globals`+`supertest` 支撑 API 覆盖率。测试文件放置于 `tests/` 并以 `*.test.js` 结尾，命名描述行为（如 `provider-pool-manager.test.js`）。集成测试需要外部服务可访问的 `TEST_SERVER_BASE_URL`，运行前请先执行 .\install-and-run.bat 以提供真实端点。失败时请附带服务器日志与 `PROMPT_LOG_FILENAME` 片段，便于追溯代理层问题。

## Commit & Pull Request Guidelines
Git 历史遵循类 Conventional Commits（如 `feat: Add model prefix system`、`docs(terminology): ...`）。请保持 `<type>(<optional-scope>): <imperative summary>`，必要时追加中文补充，但首句应 ≤72 字符。提交中引用相关 issue（`Fixes #123`），PR 描述需要：变更概述、配置或脚本影响、测试方式（含命令输出摘要）、UI 变动截图（若适用）。当修改影响 `config.json` 或 `provider_pools.json` 时，PR 里需附示例片段，并说明敏感凭证存放方式。
