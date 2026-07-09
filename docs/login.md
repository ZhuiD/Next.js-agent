# GitHub 登录与 Postgres 持久化开发文档

## 当前目标

这个项目已经是一个带登录、数据库和聊天持久化的全栈 Agent 应用：

- 使用 GitHub OAuth 登录。
- 使用 Auth.js / NextAuth v5 管理认证会话。
- 使用 Auth.js Prisma Adapter 保存用户、账号和会话。
- 使用 Prisma 保存聊天会话、消息和用户限流状态。
- 使用 Supabase Postgres / PostgreSQL 作为数据库。

## 技术选型

| 模块 | 当前方案 |
| --- | --- |
| 认证 | Auth.js v5 + GitHub Provider |
| ORM | Prisma 7 |
| 数据库 | Supabase Postgres / PostgreSQL |
| 数据库连接 | `@prisma/adapter-pg` |
| 聊天 UI | Vercel AI SDK `useChat` |
| Agent | Root agent + GitHub / Literature subagents |

## 环境变量

本地和部署环境都需要：

```env
DATABASE_URL="postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require"
AUTH_SECRET="生成的随机密钥"
AUTH_URL="http://localhost:3000"
AUTH_GITHUB_ID="GitHub OAuth App Client ID"
AUTH_GITHUB_SECRET="GitHub OAuth App Client Secret"
DASHSCOPE_API_KEY="阿里云百炼 API Key"
DASHSCOPE_MODEL="qwen-plus"
PRO_UPGRADE_CODE="Pro 升级码"
ADMIN_UPGRADE_CODE="Admin 升级码"
```

`DATABASE_URL` 用于应用运行时连接数据库，通常走 Supabase pooler。
`DIRECT_URL` 用于 Prisma CLI 执行迁移，建议使用直连地址。

`AUTH_SECRET` 可用以下命令生成：

```bash
npx auth secret
```

## GitHub OAuth App 配置

在 GitHub Developer settings 创建 OAuth App。

本地开发配置：

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

生产环境配置：

- Homepage URL: `https://你的域名`
- Authorization callback URL: `https://你的域名/api/auth/callback/github`

需要从 GitHub 获取：

- Client ID，对应 `AUTH_GITHUB_ID`
- Client Secret，对应 `AUTH_GITHUB_SECRET`

## 数据库模型

Auth.js Prisma Adapter 使用这些标准模型：

- `User`
- `Account`
- `Session`
- `VerificationToken`

业务模型：

- `Chat`：用户的一条对话。
- `Message`：对话里的用户消息、助手消息和 AI SDK message parts。
- `RateLimit`：用户当前限流窗口的计数状态。

`partsJson` 保存 AI SDK UI message parts，方便历史消息恢复时继续展示工具调用卡片。

## Prisma Client 生成

`prisma/schema.prisma` 里把 Prisma Client 输出到项目内的 `generated/prisma`：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}
```

运行时代码从这里导入：

```ts
import { PrismaClient } from '@/generated/prisma/client';
```

`generated/` 不提交到 Git，所以干净环境必须先执行：

```bash
pnpm generate
```

当前 `pnpm build` 已经会自动先运行 `prisma generate`，避免部署时缺少生成物。

## 常用流程

安装依赖：

```bash
pnpm install
```

生成 Prisma Client：

```bash
pnpm generate
```

应用数据库迁移：

```bash
pnpm exec prisma migrate deploy
```

启动开发服务器：

```bash
pnpm dev
```

生产构建：

```bash
pnpm build
```

## 相关文件

- `auth.ts`：NextAuth 配置，接入 GitHub Provider 和 Prisma Adapter。
- `app/api/auth/[...nextauth]/route.ts`：Auth.js 路由。
- `lib/prisma.ts`：Prisma Client 单例和 Postgres adapter。
- `prisma/schema.prisma`：数据库模型。
- `prisma.config.ts`：Prisma CLI 配置，加载 `.env.local` / `.env`。
- `app/api/chat/route.ts`：登录校验、限流、聊天保存和 Agent 流式调用。
