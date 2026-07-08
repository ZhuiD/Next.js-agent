// 用户级别限流：基于数据库的用户时间窗口
//
// 学习要点：
// 1. 为什么选 DB 而不是内存？
//    Vercel 等 Serverless 平台每次请求可能运行在不同进程/实例上，
//    内存里的计数器无法共享，必须用外部存储（DB / Redis）。
//
// 2. 当前实现是什么窗口？
//    固定窗口：每小时整点清零，用户可以在 :59 发20条、:01 又发20条，
//              实际上两分钟内发了40条，绕过了限制。
//    当前实现：从用户第一次请求开始计时，往后推1小时。
//    它不是严格的 sliding log，但比“整点清零”更公平，也更容易用 SQLite 实现。
//
// 3. 为什么用 upsert？
//    用户第一次请求时 RateLimit 表里没有记录，upsert 会自动创建；
//    后续请求则更新已有记录。避免了"先查再判断再插入/更新"的竞态条件。

import { prisma } from '@/lib/prisma';

// 各套餐每小时允许的最大请求次数
const PLAN_LIMITS: Record<string, number> = {
  free: 20,
  pro: 200,
  admin: Infinity, // admin 不受限制
};

const WINDOW_MS = 60 * 60 * 1000; // 1 小时，单位毫秒

interface RateLimitRecord {
  count: number;
  windowStart: Date;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number; // 距离窗口重置还有多少秒（超限时才有）
}

export interface RateLimitStatus {
  plan: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  windowStart: Date | null;
  resetAt: Date | null;
  retryAfter: number | null;
  windowSeconds: number;
}

function getPlanLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

function buildRateLimitStatus(
  plan: string,
  record: RateLimitRecord | null,
  now: Date,
): RateLimitStatus {
  const limit = getPlanLimit(plan);
  const unlimited = limit === Infinity;

  if (unlimited) {
    return {
      plan,
      limit: null,
      used: 0,
      remaining: null,
      unlimited: true,
      windowStart: null,
      resetAt: null,
      retryAfter: null,
      windowSeconds: WINDOW_MS / 1000,
    };
  }

  const windowExpired =
    !record || now.getTime() - record.windowStart.getTime() >= WINDOW_MS;

  // 没有当前窗口，或窗口已经过期：展示为“本小时还没用过”。
  // 真正的新窗口会在下一次请求时由 checkUserRateLimit 创建。
  if (windowExpired) {
    return {
      plan,
      limit,
      used: 0,
      remaining: limit,
      unlimited: false,
      windowStart: null,
      resetAt: null,
      retryAfter: null,
      windowSeconds: WINDOW_MS / 1000,
    };
  }

  const resetAt = new Date(record.windowStart.getTime() + WINDOW_MS);
  const remaining = Math.max(limit - record.count, 0);

  return {
    plan,
    limit,
    used: record.count,
    remaining,
    unlimited: false,
    windowStart: record.windowStart,
    resetAt,
    retryAfter:
      remaining === 0 ? Math.ceil((resetAt.getTime() - now.getTime()) / 1000) : null,
    windowSeconds: WINDOW_MS / 1000,
  };
}

export async function getUserRateLimitStatus(
  userId: string,
  plan: string,
): Promise<RateLimitStatus> {
  const record = await prisma.rateLimit.findUnique({
    where: { userId },
    select: { count: true, windowStart: true },
  });

  return buildRateLimitStatus(plan, record, new Date());
}

export async function checkUserRateLimit(
  userId: string,
  plan: string,
): Promise<RateLimitResult> {
  const limit = getPlanLimit(plan);

  // admin 直接放行，不查数据库
  if (limit === Infinity) {
    return { allowed: true, limit: Infinity, remaining: Infinity };
  }

  const now = new Date();

  // upsert：有记录则读取，没有则以当前时间和 count=0 初始化
  // 注意：这里分两步（先 upsert 初始化，再判断逻辑）是为了代码清晰，
  // 生产级别可以用一条原子 SQL 语句，但 SQLite 下并发压力不大，这样够用。
  const record = await prisma.rateLimit.upsert({
    where: { userId },
    create: {
      userId,
      count: 0,
      windowStart: now,
    },
    update: {}, // 先不更新，拿到现有数据后再判断
  });

  const windowAge = now.getTime() - record.windowStart.getTime();
  const windowExpired = windowAge >= WINDOW_MS;

  if (windowExpired) {
    // 时间窗口已过期，重置计数器，本次请求算第 1 次
    await prisma.rateLimit.update({
      where: { userId },
      data: { count: 1, windowStart: now },
    });
    return { allowed: true, limit, remaining: limit - 1 };
  }

  // 窗口还在有效期内
  if (record.count >= limit) {
    // 已超限，计算还需要等多久（窗口到期时间 - 现在）
    const resetAt = record.windowStart.getTime() + WINDOW_MS;
    const retryAfter = Math.ceil((resetAt - now.getTime()) / 1000);
    return { allowed: false, limit, remaining: 0, retryAfter };
  }

  // 未超限，count + 1
  await prisma.rateLimit.update({
    where: { userId },
    data: { count: { increment: 1 } },
  });

  return { allowed: true, limit, remaining: limit - record.count - 1 };
}
