# GitTrendInsight & Research Agent

一个基于 Next.js 的全栈 AI 调研助手，支持：

- GitHub Trending 趋势项目分析
- arXiv 论文检索与中文调研报告
- GitHub OAuth 登录
- SQLite 本地数据库持久化用户、会话和消息
- 后续迁移到 Supabase Postgres 的 Prisma 数据模型基础

## 技术栈

- Next.js 15 App Router
- React 18
- TypeScript
- Tailwind CSS
- Vercel AI SDK
- Auth.js / NextAuth v5
- Prisma 7
- SQLite，本地使用 `file:./dev.db`
- DashScope OpenAI-compatible API，默认模型 `qwen-plus`

## 功能概览

### GitHub 趋势分析

用户可以输入类似：

```txt
最近 24 小时最火的 AI 项目，用中文总结
本周 TypeScript 趋势仓库，挑 5 个深度点评
```

系统会抓取 GitHub Trending，并生成中文分析报告。

### 文献调研

用户可以输入类似：

```txt
帮我调研近 1 年视频生成扩散模型方向的 arXiv 论文
最新的 3D 高斯泼溅有哪些新工作？
```

系统会检索 arXiv，并整理结构化中文报告。

### 登录与持久化

- 使用 GitHub OAuth 登录。
- 使用 Auth.js Prisma Adapter 保存用户、账户和会话。
- 使用 Prisma 保存聊天会话和消息。
- 不使用 `localStorage` 保存对话内容。

## 本地开发初始化

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备环境变量

复制环境变量模板：

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`：

```env
# 阿里云百炼 DashScope API Key
DASHSCOPE_API_KEY=sk-xxx

# 可选：默认 qwen-plus
# DASHSCOPE_MODEL=qwen-plus

# 本地 SQLite 数据库
DATABASE_URL="file:./dev.db"

# Auth.js
AUTH_SECRET="dev-secret"
AUTH_URL="http://localhost:3000"

# GitHub OAuth App
AUTH_GITHUB_ID="your-github-oauth-client-id"
AUTH_GITHUB_SECRET="your-github-oauth-client-secret"
```

本地开发时 `AUTH_SECRET` 可以先用简单值，例如：

```env
AUTH_SECRET="dev-secret"
```

生产环境必须换成高强度随机字符串。

可以用以下命令生成：

```bash
openssl rand -base64 32
```

### 3. 创建 GitHub OAuth App

在 GitHub Developer Settings 创建 OAuth App。

本地开发填写：

```txt
Homepage URL:
http://localhost:3000

Authorization callback URL:
http://localhost:3000/api/auth/callback/github
```

创建完成后，把 GitHub 提供的值填入 `.env.local`：

```env
AUTH_GITHUB_ID="Client ID"
AUTH_GITHUB_SECRET="Client Secret"
```

说明：

- `AUTH_GITHUB_ID` 和 `AUTH_GITHUB_SECRET` 用于让本站向 GitHub 证明 OAuth App 身份。
- `AUTH_SECRET` 是本站内部用于签名和加密登录 session 的密钥。

### 4. 生成 Prisma Client

```bash
pnpm exec prisma generate
```

### 5. 同步数据库表结构

```bash
pnpm exec prisma db push
```

这一步会根据 `prisma/schema.prisma` 在本地 SQLite 数据库中创建表，包括：

- `User`
- `Account`
- `Session`
- `VerificationToken`
- `Chat`
- `Message`

可以理解为：

```txt
schema.prisma 是数据库设计图，prisma db push 是把设计图应用到真实数据库。
```

### 6. 启动开发服务器

```bash
pnpm dev
```

如果 GitHub OAuth 回调时报 `UND_ERR_CONNECT_TIMEOUT`，通常是本地 Node.js 服务端访问 GitHub 超时。使用代理时，可以让启动开发服务器的终端显式走 HTTP/HTTPS 代理：

```bash
HTTPS_PROXY=http://127.0.0.1:你的端口 HTTP_PROXY=http://127.0.0.1:你的端口 pnpm dev
```

打开：

```txt
http://localhost:3000
```

## 常用命令

```bash
# 启动开发服务器
pnpm dev

# 生产构建
pnpm build

# 启动生产服务
pnpm start

# 类型检查
pnpm exec tsc --noEmit

# 生成 Prisma Client
pnpm exec prisma generate

# 同步数据库 schema 到本地 SQLite
pnpm exec prisma db push
```

## 数据库说明

当前本地开发使用 SQLite：

```env
DATABASE_URL="file:./dev.db"
```

SQLite 数据库文件 `dev.db` 会在执行 `prisma db push` 后自动创建。

当前使用 Prisma libSQL adapter 连接 SQLite，避免 `better-sqlite3` native binding 在不同 Node/pnpm 环境下的编译问题。

## Supabase 迁移准备

后续迁移 Supabase 时，建议继续使用 Auth.js，Supabase 先作为 Postgres 数据库托管服务。

本地 SQLite datasource：

```prisma
datasource db {
  provider = "sqlite"
}
```

迁移到 Supabase Postgres 时，可调整为：

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

并将 `.env.local` / 生产环境变量切换为 Supabase Postgres 连接串。

## 目录结构

```txt
app/
  api/
    auth/[...nextauth]/route.ts  Auth.js 路由
    chat/route.ts                AI 聊天接口
  page.tsx                       首页聊天 UI
agent/                           root agent 与 subagents
tool/                            GitHub Trending / arXiv 工具
component/                       UI 组件
lib/                             模型、数据库、抓取工具
prisma/schema.prisma             Prisma 数据模型
docs/login.md                    登录与数据库开发文档
```

## 注意事项

- 不要提交 `.env.local`。
- 不要提交本地 SQLite 数据库文件 `dev.db`。
- GitHub OAuth callback URL 必须和当前访问域名匹配。
- 如果改动了 `prisma/schema.prisma`，需要重新执行：

```bash
pnpm exec prisma generate
pnpm exec prisma db push
```
