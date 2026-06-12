# GitTrendInsight Agent

> 用一句自然语言问，AI 自动抓取 GitHub Trending 并生成结构化的中文洞察报告。

## 技术栈

- **Next.js 15** App Router + TypeScript
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai` + `@ai-sdk/react`)，使用 `ToolLoopAgent` 实现多步工具调用
- **阿里云百炼 (DashScope) `qwen-plus`**，通过 OpenAI 兼容接口接入
- **cheerio** 抓取 `github.com/trending`（GitHub 官方无 Trending API）
- **Tailwind CSS** + `@tailwindcss/typography` + `react-markdown`

## 项目结构

```
app/
  api/chat/route.ts   # POST /api/chat —— 把 useChat 的消息转发给 agent
  page.tsx            # 聊天 UI（流式 markdown + 趋势卡片）
  layout.tsx
agent/
  trending-agent.ts   # ToolLoopAgent：模型 + 系统提示 + tools 注册
tool/
  trending-tool.ts    # ai.tool() 包装 trending scraper
lib/
  model.ts            # DashScope OpenAI 兼容 provider
  github-trending.ts  # cheerio 抓取 + 解析 trending 页面
component/
  chat-input.tsx
  trending-view.tsx   # 工具结果卡片渲染
```

## 启动步骤

1. 在[百炼控制台](https://bailian.console.aliyun.com/?apiKey=1)申请一个 API Key（新账号有免费 token 额度）。
2. 配置环境变量：
   ```bash
   cp .env.local.example .env.local
   # 编辑 .env.local，把 DASHSCOPE_API_KEY 填进去
   ```
3. 安装并启动：
   ```bash
   pnpm install
   pnpm dev
   ```
4. 打开 http://localhost:3000，试试这些提问：
   - "最近 24 小时最火的 AI 项目，用中文总结"
   - "本周 TypeScript 趋势仓库，挑 5 个深度点评"
   - "这个月 Rust 生态有什么值得关注的新项目？"

## 切换模型

默认使用 `qwen-plus`。可在 `.env.local` 覆盖：

```env
DASHSCOPE_MODEL=qwen-max   # 更强但更贵
DASHSCOPE_MODEL=qwen-turbo # 更便宜
```

如需换成 OpenAI / DeepSeek，编辑 `lib/model.ts` 的 `baseURL` 和 `apiKey` 即可。
