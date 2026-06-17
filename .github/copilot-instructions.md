# Next.js-agent 代码审查指引

本仓库是一个 Next.js 15 + Vercel AI SDK 的多 Agent 聊天应用（GitHub 趋势 / arXiv 文献调研）。审查时以「帮助贡献者顺利合并」为主，不必过于苛刻。

## 项目架构（了解即可，大改时再提醒）

- 主 agent（`agent/root-agent.ts`）负责路由，不直接调用叶子工具
- 领域逻辑放在 subagent（`github-agent.ts`、`research-agent.ts`），通过 `tool/*-research-tool.ts` 暴露
- system prompt 放在 `agent/prompts/`，用 `buildSystemPrompt()` 组装
- 叶子工具在 `tool/`，外部 API 封装在 `lib/`

新增能力时，优先沿用上述分层，而不是把所有逻辑堆进一个文件。

## 值得指出的问题

**安全（优先）**

- 不要把 API Key、token 写进代码或提交到仓库
- 用户输入进入 LLM 或外部 API 前，建议做基本校验

**可靠性**

- 调用 arXiv、GitHub Trending 等外部服务时，应有超时和失败处理
- Agent 场景下，工具失败时不要编造数据（可参考 `agent/prompts/anti-hallucination.ts` 的思路）

**TypeScript**

- 尽量避免 `any`，复杂输入可用 zod 校验
- 新增公开 API 或 tool 参数，类型尽量写清楚

## 可以放宽的地方

- 小改动不必强求补测试或更新 README
- 命名、注释风格与现有代码大致一致即可，不必完全一致
- 纯 UI 微调、文案修改，除非有明显 bug，否则不必过度审查

## Review 风格

- 用中文回复
- 先肯定合理的部分，再提改进建议
- 建议要具体、可操作；不确定的地方可以提问，而不是直接否定
