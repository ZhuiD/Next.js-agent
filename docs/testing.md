# 测试运行方式

这个仓库把快速本地反馈和完整 CI 验证分开。正常开发不要求在电脑上常驻 PostgreSQL，也不要求连接 Supabase 才能运行基础检查。

## 日常本地检查

修改普通前端、Agent prompt 或纯逻辑后，优先运行：

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
```

较大的改动提交前可以运行：

```bash
pnpm test:quality
```

它依次执行 lint、Prisma Client 生成、TypeScript 检查、单元测试和生产构建。`pnpm test:ci` 保留为它的兼容别名，但它只对应 GitHub Actions 的 Quality job，不包含数据库集成测试和浏览器测试。

## GitHub Actions 完整验证

push 或创建 Pull Request 后，GitHub Actions 会分别运行：

- Quality：静态检查、单元测试和构建。
- Integration：启动临时 PostgreSQL 16、应用 migrations，再运行真实数据库集成测试。
- E2E：安装 Chromium，用 mock API 验证浏览器流程。

CI 中的 PostgreSQL 只属于当次 job，结束后自动销毁。它不会访问本地数据库，也不会访问开发或生产 Supabase。

因此，如果当前任务不需要调试事务、原始 SQL、级联删除或数据库并发，可以只在本地运行快速检查，把完整数据库验证交给 CI。

## 可选的本地数据库集成测试

只有需要快速调试数据库行为时，才需要本地 `codex_test`：

1. 启动本地 PostgreSQL。
2. 创建一次性数据库 `codex_test`。
3. 复制测试环境变量。
4. 应用 migrations。
5. 运行集成测试。

```bash
cp .env.test.example .env.test
pnpm db:test:migrate
pnpm test:integration
```

`pnpm test:integration` 会先检查：

- URL 是否指向名为 `codex_test` 的数据库。
- 是否显式允许测试清理数据。
- PostgreSQL 是否可以连接。
- 当前 schema 是否已经包含所需表。

如果本地 PostgreSQL 没有启动，它会直接说明连接失败以及可以改由 GitHub Actions 执行，不再输出几十个内容相同的 Prisma 测试失败。

如果没有 `.env.test`，数据库业务用例会在本地跳过，并输出配置说明；GitHub Actions 中仍会完整执行。

## 是否使用 Supabase 测试

技术上可以连接 Supabase，但只能使用完全独立的测试项目或数据库分支。不能使用 `.env.local` 中的开发库或生产库，因为集成测试会删除 `codex_test` 中的所有业务数据。

默认推荐 GitHub Actions 的临时 PostgreSQL，原因是：

- 不需要保存远程数据库密钥。
- Pull Request 代码接触不到 Supabase 凭据。
- 并行任务之间不会互相清理数据。
- 没有网络延迟、长期脏数据和额外配额成本。

## E2E 测试

首次运行前安装浏览器：

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

E2E 会启动本地 Next.js 测试服务器，但浏览器侧的 Auth、会话、额度和 LLM 流均使用 mock，不要求真实 GitHub OAuth、Supabase 或 DashScope。
