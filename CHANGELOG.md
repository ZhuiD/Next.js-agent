# Changelog

## 2026-06-17 — 多 Provider 支持

### 变更

- **`lib/model.ts`**：从硬编码阿里云百炼改为通用 OpenAI 兼容 Provider，通过环境变量切换 LLM 服务商
  - `LLM_API_KEY` — API Key（必填）
  - `LLM_BASE_URL` — Base URL，默认阿里云百炼
  - `LLM_MODEL` — 模型名，默认 `qwen-plus`
  - 同时兼容旧变量 `DASHSCOPE_API_KEY`
- **`.env.local.example`**：更新为多 provider 配置说明，附各厂 URL 和模型名速查
- **`.gitignore`**：新增 `package-lock.json` 忽略规则（项目使用 pnpm）
