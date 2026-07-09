// 用户级别限流：基于数据库的用户时间窗口
//
// 学习要点：
// 1. 为什么选 DB 而不是内存？
//    Vercel 等 Serverless 平台每次请求可能运行在不同进程/实例上，
//    内存里的计数器无法共享，必须用外部存储（DB / Redis）。
//
// 2. 当前实现是什么窗口？
//    从用户第一次请求开始计时，往后推 1 小时。
//    它不是严格的 sliding log，但比“整点清零”更公平，也更容易展示 resetAt。
//
// 3. 为什么用原子 SQL？
//    限流本质是 read-modify-write：读 count、判断是否超限、再把 count + 1。
//    如果在应用层分三步做，并发请求可能同时读到旧 count，然后都被放行。
//    这里把“创建/重置/扣一次/返回新状态”交给 Postgres 的同一条写语句，
//    让数据库用同一行上的写锁来串行化同一个用户的额度消费。

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

interface RateLimitSqlRow {
  count: number | bigint;
  windowStart: Date;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number; // 距离窗口重置还有多少秒（超限时才有）
  reservationWindowStart?: Date; // 本次扣费落在哪个窗口里，失败退款时用来避免退错窗口
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

function normalizeSqlRow(row: RateLimitSqlRow): RateLimitRecord {
  return {
    count: Number(row.count),
    windowStart: row.windowStart,
  };
}

function buildAllowedResult(
  record: RateLimitRecord,
  limit: number,
): RateLimitResult {
  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - record.count, 0),
    reservationWindowStart: record.windowStart,
  };
}

function buildBlockedResult(
  record: RateLimitRecord,
  limit: number,
  now: Date,
): RateLimitResult {
  const resetAt = record.windowStart.getTime() + WINDOW_MS;
  const retryAfter = Math.max(
    1,
    Math.ceil((resetAt - now.getTime()) / 1000),
  );

  return { allowed: false, limit, remaining: 0, retryAfter };
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
  const windowCutoff = new Date(now.getTime() - WINDOW_MS);

  // 这一条语句覆盖三种“允许通过”的情况：
  // 1. 用户还没有 RateLimit 记录：INSERT count=1
  // 2. 旧窗口已过期：重置 count=1，并把 windowStart 改成 now
  // 3. 当前窗口未超限：count 原子 +1
  //
  // 关键点在 WHERE：
  // - 如果当前窗口没过期且 count >= limit，DO UPDATE 会被跳过，RETURNING 返回空数组。
  // - 并发请求写同一个 userId 时，Postgres 会锁住这一行；后一个 UPDATE 会等前一个提交后，
  //   再基于最新 count 重新判断 WHERE，从而避免两个请求同时“看到还剩 1 次”。
  //
  // 用 tagged template 写 raw SQL，Prisma 会把变量作为参数传给数据库，避免字符串拼接注入。
  const consumed = await prisma.$queryRaw<RateLimitSqlRow[]>`
    INSERT INTO "RateLimit" ("userId", "count", "windowStart")
    VALUES (${userId}, 1, ${now})
    ON CONFLICT ("userId") DO UPDATE
    SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" <= ${windowCutoff} THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" <= ${windowCutoff} THEN ${now}
        ELSE "RateLimit"."windowStart"
      END
    WHERE
      "RateLimit"."windowStart" <= ${windowCutoff}
      OR "RateLimit"."count" < ${limit}
    RETURNING "count", "windowStart"
  `;

  if (consumed[0]) {
    return buildAllowedResult(normalizeSqlRow(consumed[0]), limit);
  }

  // RETURNING 为空表示“已有当前窗口记录，并且已经达到 limit”。
  // 再读一次只用于给前端算 retryAfter；这次读取不参与放行决策，所以不会引入超扣。
  const record = await prisma.rateLimit.findUnique({
    where: { userId },
    select: { count: true, windowStart: true },
  });

  if (!record) {
    // 理论上不会发生：上面的 INSERT 失败且又读不到记录，通常代表数据库状态异常。
    // 这里保守拒绝，避免在状态不明时放行昂贵的 LLM 请求。
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfter: WINDOW_MS / 1000,
    };
  }

  return buildBlockedResult(record, limit, now);
}

export async function refundUserRateLimit(
  userId: string,
  reservationWindowStart: Date,
): Promise<boolean> {
  // 这是“轻量退款”，只把刚才预占的一次计数从同一个窗口里扣回去。
  //
  // 为什么 WHERE 要带 windowStart？
  // - 用户的限流记录只有一行，窗口过期后下一次请求会把 windowStart 重置成新窗口。
  // - 如果失败回调来得很晚，不能把新窗口里的额度误减掉。
  //
  // 这一版还不是完整账本：它不能跨进程证明“同一个请求只退一次”。
  // 真正需要审计、幂等、成本对账时，下一步应加 QuotaUsage 表记录 reserved/succeeded/refunded。
  const refunded = await prisma.$queryRaw<RateLimitSqlRow[]>`
    UPDATE "RateLimit"
    SET "count" = GREATEST("count" - 1, 0)
    WHERE
      "userId" = ${userId}
      AND "windowStart" = ${reservationWindowStart}
      AND "count" > 0
    RETURNING "count", "windowStart"
  `;

  return refunded.length > 0;
}
