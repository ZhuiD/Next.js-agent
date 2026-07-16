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
  reservationId?: string; // QuotaUsage 主键，后续确认消费或退款都必须带它
  reservationWindowStart?: Date;
  duplicate?: boolean; // requestId 已存在；调用方不应再次执行昂贵的业务逻辑
}

export interface QuotaReservationContext {
  requestId?: string;
  chatId?: string;
}

interface QuotaUsageLockRow {
  windowStart: Date;
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
  reservationId: string,
): RateLimitResult {
  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - record.count, 0),
    reservationId,
    reservationWindowStart: record.windowStart,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

async function buildDuplicateResult(
  userId: string,
  requestId: string,
  limit: number,
): Promise<RateLimitResult> {
  const [usage, record] = await Promise.all([
    prisma.quotaUsage.findUnique({ where: { requestId } }),
    prisma.rateLimit.findUnique({
      where: { userId },
      select: { count: true, windowStart: true },
    }),
  ]);

  if (!usage || usage.userId !== userId) {
    // requestId 来自用户消息 id，正常客户端会生成全局唯一值。
    // 若它撞到了别人的流水，不能复用那条记录，也不能泄露其内容。
    throw new Error('Quota request id conflicts with another reservation');
  }

  return {
    allowed: true,
    duplicate: true,
    limit,
    remaining: Math.max(limit - (record?.count ?? 0), 0),
    reservationId: usage.id,
    reservationWindowStart: usage.windowStart,
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
  context: QuotaReservationContext = {},
): Promise<RateLimitResult> {
  const limit = getPlanLimit(plan);

  // admin 直接放行，不查数据库
  if (limit === Infinity) {
    return { allowed: true, limit: Infinity, remaining: Infinity };
  }

  const now = new Date();
  const windowCutoff = new Date(now.getTime() - WINDOW_MS);
  const requestId = context.requestId ?? crypto.randomUUID();

  try {
    return await prisma.$transaction(async tx => {
      const existingUsage = await tx.quotaUsage.findUnique({
        where: { requestId },
      });

      if (existingUsage) {
        if (existingUsage.userId !== userId) {
          throw new Error('Quota request id conflicts with another reservation');
        }

        const record = await tx.rateLimit.findUnique({
          where: { userId },
          select: { count: true, windowStart: true },
        });

        return {
          allowed: true,
          duplicate: true,
          limit,
          remaining: Math.max(limit - (record?.count ?? 0), 0),
          reservationId: existingUsage.id,
          reservationWindowStart: existingUsage.windowStart,
        };
      }

      // RateLimit 的原子 UPSERT 负责锁住同一用户的计数行；QuotaUsage.create
      // 和它处于同一事务，所以不会出现“计数加了但流水没写”或反过来的半成品。
      const consumed = await tx.$queryRaw<RateLimitSqlRow[]>`
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

      if (!consumed[0]) {
        // RETURNING 为空表示已有当前窗口，并且额度已经用完。
        const record = await tx.rateLimit.findUnique({
          where: { userId },
          select: { count: true, windowStart: true },
        });

        if (!record) {
          return {
            allowed: false,
            limit,
            remaining: 0,
            retryAfter: WINDOW_MS / 1000,
          };
        }

        return buildBlockedResult(record, limit, now);
      }

      const record = normalizeSqlRow(consumed[0]);
      const usage = await tx.quotaUsage.create({
        data: {
          userId,
          requestId,
          chatId: context.chatId,
          plan,
          limit,
          windowStart: record.windowStart,
        },
      });

      return buildAllowedResult(record, limit, usage.id);
    });
  } catch (error) {
    // 两个完全相同的请求可能同时通过上面的首次查询。唯一索引只允许
    // 一个 requestId 落库；输掉竞争的事务会整体回滚（包括 count + 1）。
    if (isUniqueConstraintError(error)) {
      return buildDuplicateResult(userId, requestId, limit);
    }

    throw error;
  }
}

export async function refundUserRateLimit(
  userId: string,
  reservationId: string,
  reason: string,
): Promise<boolean> {
  return prisma.$transaction(async tx => {
    // FOR UPDATE 先锁住这条流水。多个进程同时退款时，只有第一个能看到
    // RESERVED；后续调用看到 REFUNDED 后直接返回 false，因此跨进程也只退一次。
    const reservations = await tx.$queryRaw<QuotaUsageLockRow[]>`
      SELECT "windowStart"
      FROM "QuotaUsage"
      WHERE
        "id" = ${reservationId}
        AND "userId" = ${userId}
        AND "status" = 'RESERVED'
      FOR UPDATE
    `;
    const reservation = reservations[0];

    if (!reservation) return false;

    // 退款只能退回预占时所属的窗口。延迟回调若撞上新窗口，会保留
    // RESERVED 流水供后续人工/补偿任务处理，不能误减新窗口的次数。
    const refunded = await tx.$queryRaw<RateLimitSqlRow[]>`
      UPDATE "RateLimit"
      SET "count" = GREATEST("count" - 1, 0)
      WHERE
        "userId" = ${userId}
        AND "windowStart" = ${reservation.windowStart}
        AND "count" > 0
      RETURNING "count", "windowStart"
    `;

    if (!refunded[0]) return false;

    await tx.quotaUsage.update({
      where: { id: reservationId },
      data: {
        status: 'REFUNDED',
        refundReason: reason,
        refundedAt: new Date(),
      },
    });

    return true;
  });
}

export async function confirmUserQuotaUsage(
  userId: string,
  reservationId: string,
  reason: string,
): Promise<boolean> {
  // 确认消费不再修改 RateLimit.count，因为次数在 RESERVED 时已经原子预占。
  // updateMany 的状态条件让“确认”和“退款”竞争时只能有一个状态转换成功。
  const consumed = await prisma.quotaUsage.updateMany({
    where: {
      id: reservationId,
      userId,
      status: 'RESERVED',
    },
    data: {
      status: 'CONSUMED',
      consumeReason: reason,
      consumedAt: new Date(),
    },
  });

  return consumed.count === 1;
}
