import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  cleanupDatabase,
  createTestUser,
  describeWithTestDatabase,
  explainSkippedIntegrationTests,
  hasTestDatabase,
} from './utils/db';
import type { prisma as prismaExport } from '@/lib/prisma';
import type * as userRateLimitModule from '@/lib/user-rate-limit';

let prisma: typeof prismaExport;
let rateLimit: typeof userRateLimitModule;

describeWithTestDatabase('user rate limit integration', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    rateLimit = await import('@/lib/user-rate-limit');
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test('serializes concurrent quota consumption for the same free user', async () => {
    const user = await createTestUser(prisma, { plan: 'free' });

    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        rateLimit.checkUserRateLimit(user.id, 'free'),
      ),
    );

    const allowed = results.filter(result => result.allowed);
    const blocked = results.filter(result => !result.allowed);
    const record = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(allowed).toHaveLength(20);
    expect(blocked).toHaveLength(5);
    expect(record?.count).toBe(20);
  });

  test('resets an expired window before consuming the next quota', async () => {
    const user = await createTestUser(prisma, { plan: 'free' });
    const oldWindowStart = new Date(Date.now() - 2 * 60 * 60 * 1000);

    await prisma.rateLimit.create({
      data: {
        userId: user.id,
        count: 20,
        windowStart: oldWindowStart,
      },
    });

    const result = await rateLimit.checkUserRateLimit(user.id, 'free');
    const record = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
    expect(record?.count).toBe(1);
    expect(record?.windowStart.getTime()).toBeGreaterThan(
      oldWindowStart.getTime(),
    );
  });

  test('refunds only the reservation window that originally consumed quota', async () => {
    const user = await createTestUser(prisma, { plan: 'free' });
    const consumed = await rateLimit.checkUserRateLimit(user.id, 'free');

    expect(consumed.allowed).toBe(true);
    expect(consumed.reservationWindowStart).toBeInstanceOf(Date);

    const refunded = await rateLimit.refundUserRateLimit(
      user.id,
      consumed.reservationWindowStart!,
    );
    const recordAfterRefund = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(refunded).toBe(true);
    expect(recordAfterRefund?.count).toBe(0);

    const staleWindowStart = consumed.reservationWindowStart!;
    const newWindowStart = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.rateLimit.update({
      where: { userId: user.id },
      data: { count: 3, windowStart: newWindowStart },
    });

    const staleRefund = await rateLimit.refundUserRateLimit(
      user.id,
      staleWindowStart,
    );
    const recordAfterStaleRefund = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(staleRefund).toBe(false);
    expect(recordAfterStaleRefund?.count).toBe(3);
    expect(recordAfterStaleRefund?.windowStart).toEqual(newWindowStart);
  });

  test('admin users are allowed without creating a RateLimit row', async () => {
    const user = await createTestUser(prisma, { plan: 'admin' });

    const result = await rateLimit.checkUserRateLimit(user.id, 'admin');
    const record = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(record).toBeNull();
  });
});

describe.skipIf(hasTestDatabase)('user rate limit integration setup', () => {
  test('explains why database integration tests were skipped', () => {
    expect(explainSkippedIntegrationTests()).toMatch(/TEST_DATABASE_URL|ALLOW/);
  });
});
