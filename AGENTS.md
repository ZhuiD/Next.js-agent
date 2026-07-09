# Project Rules

This file defines project-local working rules for Codex in this repository only.

## Development Habit

When adding or changing business behavior, think in terms of risk, not file count.
Not every code change needs a new test file, but every risky business behavior should
have test coverage at the right layer.

Prefer adding cases to an existing test file when the behavior belongs to an existing
module. Create a new test file only when there is a new module, new component, new
integration boundary, or new end-to-end user journey.

## Test Policy

Add or update tests when a change touches:

- auth, permissions, user-owned data, or cross-user isolation
- quota, billing-like logic, refunds, concurrency, or rate limits
- database writes, deletes, migrations, raw SQL, transactions, or cascades
- external APIs, scraping, parsing, retries, or error handling
- AI agent routing, tool execution, stream handling, or LLM error handling
- complex branching logic or behavior that has broken before

Tests can be lighter or omitted for pure copy changes, static styling changes, and
thin UI wrappers that are already covered by a higher-level test.

## Test Organization

Use this structure:

- `tests/unit/lib/*.test.ts` for pure functions, parsers, helpers, and isolated server utilities.
- `tests/unit/component/*.test.tsx` for React component behavior with Testing Library.
- `tests/integration/*.test.ts` for Prisma, Route Handlers, auth boundaries, and real database behavior.
- `tests/e2e/*.spec.ts` for browser-level user flows once Playwright is added.

Examples:

- New behavior in `lib/arxiv.ts` goes into `tests/unit/lib/arxiv.test.ts`.
- New behavior in `component/chat-input.tsx` goes into `tests/unit/component/chat-input.test.tsx`.
- A new `lib/quota-usage.ts` module should get `tests/integration/quota-usage.test.ts` if it depends on the database.

## Mocking Rules

Unit tests must be deterministic and cheap:

- Use MSW for GitHub, arXiv, DashScope, or other HTTP boundaries.
- Do not call real external services from unit tests.
- Use stable HTML/XML/JSON fixtures for scraping and parsing tests.
- For AI SDK behavior, prefer official mock model/testing utilities instead of real LLM calls.

Database behavior should be tested with a real test Postgres database in integration
tests. Avoid mocking Prisma for concurrency, raw SQL, transactions, cascade deletes,
quota consumption, or refunds.

Integration tests must never use `.env.local` or the normal `DATABASE_URL`.
Use `.env.test` with `TEST_DATABASE_URL`, include `schema=codex_test`, and set
`ALLOW_TEST_DATABASE_RESET="true"` because integration tests are allowed to delete
all rows in the test database schema.

When adding database integration tests, put shared cleanup and factories under
`tests/integration/utils/` instead of duplicating setup in every test file.

## Commands

Before considering a code change done, run the narrowest useful check:

- `pnpm test:unit` for unit-only changes
- `pnpm test:integration` for database and Route Handler behavior after configuring `.env.test`
- `pnpm typecheck` after TypeScript or test typing changes
- `pnpm lint` after normal code edits
- `pnpm build` after Next.js, Prisma, env, or route changes
- `pnpm test:ci` before pushing larger changes

## Current Project Priorities

For this project, prefer this learning and implementation order:

1. Build out the test foundation.
2. Add database integration tests for quota, conversations, and route ownership.
3. Add a `QuotaUsage` ledger for auditable quota reservations/refunds.
4. Add agent observable events for product-visible progress.
5. Add Redis later for short-window anti-abuse or caching, not as the source of quota truth.

## Safety Notes

- Do not edit `.env.local` unless explicitly asked.
- Do not expose secrets in tests, logs, docs, or fixtures.
- Keep comments useful for learning, especially around backend reliability, database
  concurrency, auth boundaries, and AI stream behavior.
