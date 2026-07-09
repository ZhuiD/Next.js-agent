import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { auth } from '@/auth';
import {
  cleanupDatabase,
  createTestUser,
  describeWithTestDatabase,
  explainSkippedIntegrationTests,
  hasTestDatabase,
} from './utils/db';
import type { PrismaClient } from '@/generated/prisma/client';
import type * as meRouteModule from '@/app/api/me/route';
import type * as upgradeRouteModule from '@/app/api/account/upgrade/route';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

let prisma: PrismaClient;
let meRoute: typeof meRouteModule;
let upgradeRoute: typeof upgradeRouteModule;

const mockedAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

function mockSession(userId: string | null) {
  mockedAuth.mockResolvedValue(userId ? { user: { id: userId } } : null);
}

async function readJson<T = unknown>(response: Response) {
  return response.json() as Promise<T>;
}

describeWithTestDatabase('account route integration', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    meRoute = await import('@/app/api/me/route');
    upgradeRoute = await import('@/app/api/account/upgrade/route');
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.PRO_UPGRADE_CODE = 'test-pro-code';
    process.env.ADMIN_UPGRADE_CODE = 'test-admin-code';
    await cleanupDatabase(prisma);
  });

  afterAll(async () => {
    delete process.env.PRO_UPGRADE_CODE;
    delete process.env.ADMIN_UPGRADE_CODE;
    await prisma?.$disconnect();
  });

  test('/api/me returns account summary without consuming quota', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    const windowStart = new Date(Date.now() - 60_000);
    await prisma.rateLimit.create({
      data: { userId: user.id, count: 2, windowStart },
    });

    mockSession(user.id);

    const response = await meRoute.GET();
    const body = await readJson<{
      user: { id: string; plan: string };
      quota: { used: number; remaining: number; windowStart: string };
    }>(response);
    const record = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ id: user.id, plan: 'free' });
    expect(body.quota).toMatchObject({
      used: 2,
      remaining: 18,
      windowStart: windowStart.toISOString(),
    });
    expect(record?.count).toBe(2);
  });

  test('valid upgrade code updates the current user plan', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    mockSession(user.id);

    const response = await upgradeRoute.POST(
      new Request('http://localhost/api/account/upgrade', {
        method: 'POST',
        body: JSON.stringify({ code: 'test-pro-code' }),
      }),
    );
    const body = await readJson<{
      user: { id: string; plan: string };
      message: string;
    }>(response);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ id: user.id, plan: 'pro' });
    expect(body.message).toBe('已升级为 Pro');
    expect(updated?.plan).toBe('pro');
  });

  test('invalid upgrade code does not change the user plan', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    mockSession(user.id);

    const response = await upgradeRoute.POST(
      new Request('http://localhost/api/account/upgrade', {
        method: 'POST',
        body: JSON.stringify({ code: 'wrong-code' }),
      }),
    );
    const updated = await prisma.user.findUnique({ where: { id: user.id } });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: '升级码无效' });
    expect(updated?.plan).toBe('free');
  });
});

describe.skipIf(hasTestDatabase)('account route integration setup', () => {
  test('explains why database integration tests were skipped', () => {
    expect(explainSkippedIntegrationTests()).toMatch(/TEST_DATABASE_URL|ALLOW/);
  });
});
