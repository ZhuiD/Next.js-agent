# GitHub 登录与 SQLite 持久化开发文档

## 目标

把当前聊天式 Agent 项目升级为基础全栈应用：

- 接入 GitHub OAuth 登录。
- 使用 Auth.js / NextAuth v5 管理认证会话。
- 使用 Prisma Adapter 把用户、账号、会话数据保存到 SQLite。
- 使用 Prisma 保存用户的聊天会话和消息。
- 本地优先使用 SQLite 快速开发，后期迁移到 Supabase Postgres。

## 技术选型

| 模块 | 当前方案 | 后期迁移 |
| --- | --- | --- |
| 认证 | Auth.js v5 + GitHub Provider | 保持 Auth.js，数据库换 Supabase Postgres |
| ORM | Prisma | Prisma |
| 本地数据库 | SQLite | Supabase Postgres |
| 聊天 UI | Vercel AI SDK `useChat` | 保持 |
| Agent | 现有 root agent + subagents | 保持 |

## 环境变量

本地开发需要：

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="生成的随机密钥"
AUTH_URL="http://localhost:3000"
AUTH_GITHUB_ID="GitHub OAuth App Client ID"
AUTH_GITHUB_SECRET="GitHub OAuth App Client Secret"
DASHSCOPE_API_KEY="阿里云百炼 API Key"
```

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

### Auth.js 标准模型

Prisma schema 需要包含 Auth.js Prisma Adapter 使用的模型：

- `User`
- `Account`
- `Session`
- `VerificationToken`

### 业务模型

新增：

- `Chat`
  - `id`
  - `userId`
  - `title`
  - `createdAt`
  - `updatedAt`
- `Message`
  - `id`
  - `chatId`
  - `role`
  - `content`
  - `partsJson`
  - `createdAt`

`partsJson` 用于后续完整保存 AI SDK UI message parts；第一阶段可先保存文本内容。

## 实施步骤

### Phase 1：认证与数据库基础

1. 安装 Auth.js、Prisma、Prisma Adapter。
2. 创建 `prisma/schema.prisma`。
3. 创建 Prisma singleton。
4. 创建 `auth.ts`。
5. 创建 `app/api/auth/[...nextauth]/route.ts`。
6. 更新 `.env.local.example`。
7. 执行 `prisma db push` 和 `prisma generate`。

### Phase 2：登录 UI

1. 创建 `component/session-provider.tsx`。
2. 创建 `component/user-auth.tsx`。
3. 在 `app/layout.tsx` 注入 SessionProvider。
4. 在 `app/page.tsx` 顶部展示登录状态。

### Phase 3：聊天持久化

1. `/api/chat` 检查当前登录用户。
2. 未登录用户返回 401。
3. 保存最新用户消息。
4. Agent 调用逻辑保持不变。
5. 流式回复完成后保存 assistant 文本。

### Phase 4：历史记录

后续新增：

- `app/api/chats/route.ts`
- `app/api/chats/[chatId]/route.ts`
- `component/chat-history.tsx`

支持历史会话列表、切换会话和删除会话。

## Supabase 迁移准备

本地 SQLite：

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

迁移 Supabase Postgres 时改为：

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

建议：

- 使用 Supabase Postgres 作为数据库托管服务。
- 继续使用 Auth.js，不切换到 Supabase Auth。
- ID 使用 `cuid()`，方便 SQLite/Postgres 迁移。
- 业务枚举先用 `String`，降低 SQLite 到 Postgres 的迁移成本。
