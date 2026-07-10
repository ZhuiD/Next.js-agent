# GitTrendInsight & Research Agent

一个基于 Next.js 的全栈 AI 调研助手，支持：

- GitHub Trending 趋势项目分析
- arXiv 论文检索与中文调研报告
- GitHub OAuth 登录
- Supabase Postgres 持久化用户、会话、消息和限流状态
- Prisma Client 生成物独立输出到 `generated/prisma`

## 技术栈

- Next.js 15 App Router
- React 18
- TypeScript
- Tailwind CSS
- Vercel AI SDK
- Auth.js / NextAuth v5
- Prisma 7
- Supabase Postgres / PostgreSQL
- `@prisma/adapter-pg`
- DashScope OpenAI-compatible API，模型通过 `DASHSCOPE_MODEL` 配置

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

# 指定模型
DASHSCOPE_MODEL=qwen-plus

# Supabase Postgres
DATABASE_URL="postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require"

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
pnpm generate
```

项目的 Prisma Client 输出目录是 `generated/prisma`，该目录不会提交到 Git。
`pnpm build` 会先自动执行 `prisma generate`，避免干净部署环境里缺少生成物。

### 5. 同步数据库表结构

```bash
pnpm exec prisma migrate deploy
```

这一步会根据 `prisma/migrations` 在 Postgres 数据库中创建表，包括：

- `User`
- `Account`
- `Session`
- `VerificationToken`
- `Chat`
- `Message`
- `RateLimit`

可以理解为：

```txt
schema.prisma 是数据库设计图，migrations 是已记录的施工步骤，migrate deploy 是把步骤应用到真实数据库。
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
pnpm generate

# 将已提交的迁移应用到 Postgres
pnpm exec prisma migrate deploy

# 单元测试
pnpm test:unit

# 数据库集成测试，需要先配置 .env.test 和本地 codex_test 数据库
pnpm test:integration

# 浏览器 E2E 测试，首次换电脑需要先安装 Playwright 浏览器
pnpm test:e2e

# 本地质量检查：lint + generate + typecheck + unit + build
pnpm test:ci
```

## 测试配置

项目现在有三层测试：

- Unit tests：测试纯函数、组件和轻量逻辑，使用 Vitest / Testing Library / MSW，不需要真实数据库。
- Integration tests：测试 Prisma、Route Handler、鉴权边界和数据库行为，需要一个本地一次性 Postgres 测试库。
- E2E tests：使用 Playwright 启动真实浏览器，测试页面交互和前端链路；默认 mock 浏览器侧 API，不会调用真实 Supabase、GitHub OAuth 或 LLM。

### 数据库集成测试

`.env.test` 是本地文件，不会提交到 Git。换电脑后复制模板：

```bash
cp .env.test.example .env.test
```

默认内容是：

```env
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/codex_test?sslmode=disable"
ALLOW_TEST_DATABASE_RESET="true"
```

注意：

- `TEST_DATABASE_URL` 必须指向一个专门测试用的数据库，数据库名必须是 `codex_test`。
- 不能把它指向 `.env.local` 里的 Supabase 正式库。
- `ALLOW_TEST_DATABASE_RESET="true"` 是刻意要求显式打开的安全开关，因为集成测试会清空测试库里的表数据。

本地第一次跑集成测试前，需要先创建 `codex_test` 数据库，并把 Prisma migrations 应用到这个测试库：

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/codex_test?sslmode=disable" \
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/codex_test?sslmode=disable" \
pnpm exec prisma migrate deploy
```

然后运行：

```bash
pnpm test:integration
```

GitHub Actions 里不需要你手动配置这些变量；CI 会自动启动临时 Postgres 容器，跑完销毁。

### 浏览器 E2E 测试

E2E 测试不需要 `.env.test`，也不需要真实 DashScope / Supabase / GitHub OAuth 密钥。`playwright.config.ts` 会给测试服务器注入安全的假环境变量，测试文件会 mock `/api/auth/session`、`/api/me`、`/api/conversations` 和 `/api/chat`。

换电脑后第一次运行 Playwright，需要先安装浏览器：

```bash
pnpm exec playwright install chromium
```

然后运行：

```bash
pnpm test:e2e
```

## 数据库说明

当前项目使用 Postgres：

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

运行时代码通过 `DATABASE_URL` 连接数据库，见 `lib/prisma.ts`。
Prisma CLI 执行迁移时优先使用 `DIRECT_URL`，见 `prisma.config.ts`。

`DATABASE_URL` 通常走 Supabase pooler，适合应用运行时连接池；`DIRECT_URL` 直连数据库，适合迁移命令。

## Prisma Client 生成与部署

Prisma Client 不是手写代码，而是 Prisma 根据 `prisma/schema.prisma` 生成的类型安全数据库客户端。本项目的生成位置是：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}
```

代码里会直接引用它：

```ts
import { PrismaClient } from '@/generated/prisma/client';
```

因为 `generated/` 被 `.gitignore` 忽略，干净的 CI / Vercel / Docker 构建环境刚拉代码时没有这个目录。如果不先执行 `prisma generate`，构建会在类型检查或打包时因为找不到 `@/generated/prisma/client` 失败。

为避免这个问题，`package.json` 的构建脚本已改为：

```json
"build": "prisma generate && next build"
```

也可以手动执行：

```bash
pnpm generate
```

## Supabase / Postgres 说明

当前 datasource 已经是 Postgres：

```prisma
datasource db {
  provider = "postgresql"
}
```

具体连接串由 `prisma.config.ts` 和环境变量注入，而不是写在 `schema.prisma` 里。Supabase 部署时需要配置：

```env
DATABASE_URL="postgresql://...pooler...?...sslmode=require"
DIRECT_URL="postgresql://...direct...?...sslmode=require"
```

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
- 不要提交 `generated/`，部署构建会自动生成。
- GitHub OAuth callback URL 必须和当前访问域名匹配。
- 如果改动了 `prisma/schema.prisma`，需要重新执行：

```bash
pnpm generate
pnpm exec prisma migrate dev
```
