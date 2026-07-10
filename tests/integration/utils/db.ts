import { describe, expect } from 'vitest';
import type { PrismaClient, User } from '@/generated/prisma/client';

const resetAllowed = process.env.ALLOW_TEST_DATABASE_RESET === 'true';
const testDatabaseName = getDatabaseName(process.env.TEST_DATABASE_URL);
const usesDedicatedTestDatabase = testDatabaseName === 'codex_test';

export const hasTestDatabase = Boolean(
  process.env.TEST_DATABASE_URL && resetAllowed && usesDedicatedTestDatabase,
);

export const describeWithTestDatabase = hasTestDatabase
  ? describe
  : describe.skip;

export function explainSkippedIntegrationTests() {
  if (process.env.TEST_DATABASE_URL && !resetAllowed) {
    return 'ALLOW_TEST_DATABASE_RESET must be "true" because integration tests delete test data.';
  }

  if (process.env.TEST_DATABASE_URL && !usesDedicatedTestDatabase) {
    return 'TEST_DATABASE_URL must point at a disposable database named codex_test because integration tests delete test data.';
  }

  return 'TEST_DATABASE_URL is not configured. Copy .env.test.example to .env.test and point it at a disposable Postgres database named codex_test.';
}

function getDatabaseName(databaseUrl: string | undefined) {
  if (!databaseUrl) return null;

  try {
    const pathname = new URL(databaseUrl).pathname;
    return pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

export async function cleanupDatabase(prisma: PrismaClient) {
  expect(hasTestDatabase, explainSkippedIntegrationTests()).toBe(true);

  // Delete from child tables first so the cleanup order is explicit.
  // Some relations also cascade, but explicit cleanup keeps test isolation easy to reason about.
  await prisma.message.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(
  prisma: PrismaClient,
  overrides: Partial<Pick<User, 'id' | 'email' | 'name' | 'plan'>> = {},
) {
  const id = overrides.id ?? crypto.randomUUID();

  return prisma.user.create({
    data: {
      id,
      email: overrides.email ?? `${id}@example.test`,
      name: overrides.name ?? 'Test User',
      plan: overrides.plan ?? 'free',
    },
  });
}
