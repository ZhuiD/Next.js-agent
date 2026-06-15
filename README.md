# GitTrendInsight & Research Agent

> 用一句自然语言问，AI 自动调用工具，生成 GitHub 趋势报告或 arXiv 文献调研报告（中文）。

## 能力

| 模式 | 用途 | 工具 |
|---|---|---|
| GitHub 趋势 | 看热门仓库 / 某语言/方向的趋势项目 | `trending`（抓 github.com/trending） |
| 文献调研 | 基于 arXiv 的关键词检索、按 cs.* 分类过滤、按时间排序 | `paper_search` |
| 通用聊天 | 写代码、概念解释、翻译等 | 无工具 |

> **关于文献数据源**：当前只接入 arXiv（国内可直连、无需 key、限速宽松）。
> 不支持"按顶会精确过滤"和"引用网络"，需要这些能力时建议去对应会议 OpenAccess 站点或 arXiv 论文页底部的 "Cited by" 链接。

## 技术栈

- **Next.js 15** App Router + TypeScript
- **Vercel AI SDK** (`ai` + `@ai-sdk/react`)，使用 `ToolLoopAgent` 实现多步工具调用
- **阿里云百炼 (DashScope) `qwen-plus`**，通过 OpenAI 兼容接口接入
- **cheerio** 抓取 `github.com/trending`（GitHub 无官方 Trending API）
- **arXiv API**（无需 key）提供文献检索能力
- **Tailwind CSS** + `@tailwindcss/typography` + `react-markdown`

## 项目结构

```
app/
  api/chat/route.ts          # POST /api/chat
  page.tsx                   # 聊天 UI（流式 markdown + 工具卡片）
  layout.tsx
agent/
  trending-agent.ts          # ToolLoopAgent：模型 + 系统提示 + 工具
tool/
  trending-tool.ts           # GitHub Trending 抓取
  paper-search-tool.ts       # arXiv 论文检索
lib/
  model.ts                   # DashScope OpenAI 兼容 provider
  github-trending.ts         # cheerio 抓取 + 解析 trending 页面
  arxiv.ts                   # arXiv API 封装（含 3s 节流 + 重试）
  rate-limit.ts              # 进程内最小间隔节流器
component/
  chat-input.tsx
  trending-view.tsx          # 趋势仓库卡片
  paper-view.tsx             # arXiv 论文卡片
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

   GitHub 趋势：
   - "最近 24 小时最火的 AI 项目，用中文总结"
   - "本周 TypeScript 趋势仓库，挑 5 个深度点评"

   文献调研：
   - "帮我调研近 1 年视频生成扩散模型方向的 arXiv 论文"
   - "最新的 3D 高斯泼溅（Gaussian Splatting）有哪些新工作？"
   - "Transformer 在时序预测上的最新进展，给我列 5 篇代表作"

## 文献调研工作流

```
中文研究方向
    ↓ 关键词扩展（写明英文检索词，方便你校对）
paper_search (arXiv，可选 cs.* 分类、按相关度/时间排序)
    ↓ 可选：换关键词或切换排序方式再调一次（单轮 ≤ 2 次）
    ↓
结构化中文报告：研究脉络 + 重点论文 TLDR + 后续阅读建议
```

## 切换模型

默认使用 `qwen-plus`。可在 `.env.local` 覆盖：

```env
DASHSCOPE_MODEL=qwen-max   # 更强但更贵
DASHSCOPE_MODEL=qwen-turbo # 更便宜
```

如需换成 OpenAI / DeepSeek，编辑 `lib/model.ts` 的 `baseURL` 和 `apiKey` 即可。
