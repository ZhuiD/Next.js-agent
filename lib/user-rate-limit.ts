// 用户级别限流：基于数据库的滑动时间窗口
//
// 学习要点：
// 1. 为什么选 DB 而不是内存？
//    Vercel 等 Serverless 平台每次请求可能运行在不同进程/实例上，
//    内存里的计数器无法共享，必须用外部存储（DB / Redis）。
//
// 2. 什么是滑动窗口（Sliding Window）？
//    固定窗口：每小时整点清零，用户可以在 :59 发20条、:01 又发20条，
//              实际上两分钟内发了40条，绕过了限制。
//    滑动窗口：从用户第一次请求开始计时，往后推1小时，更公平准确。
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

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number; // 距离窗口重置还有多少秒（超限时才有）
}

export async function checkUserRateLimit(
  userId: string,
  plan: string,
): Promise<RateLimitResult> {
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

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
