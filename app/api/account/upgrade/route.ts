import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccountSummary } from '@/lib/account-summary';

const UpgradeBodySchema = z.object({
  code: z.string().trim().min(1).max(100),
});

type UpgradePlan = 'pro' | 'admin';

function getPlanByCode(code: string): UpgradePlan | null {
  const proCode = process.env.PRO_UPGRADE_CODE;
  const adminCode = process.env.ADMIN_UPGRADE_CODE;

  if (proCode && code === proCode) return 'pro';
  if (adminCode && code === adminCode) return 'admin';

  return null;
}

// POST /api/account/upgrade
//
// 当前登录用户用“服务端口令”升级自己的套餐。
// 口令只从服务端环境变量读取，前端永远只提交用户输入的 code。
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }

  const parsed = UpgradeBodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: '请输入有效升级码' }, { status: 400 });
  }

  const plan = getPlanByCode(parsed.data.code);

  if (!plan) {
    // 不区分“口令不存在”还是“口令错误”，避免暴露可猜测信息。
    return Response.json({ error: '升级码无效' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { plan },
  });

  const summary = await getAccountSummary(session.user.id);

  if (!summary) {
    return Response.json({ error: '用户不存在' }, { status: 404 });
  }

  return Response.json({
    ...summary,
    message: plan === 'admin' ? '已升级为 Admin' : '已升级为 Pro',
  });
}
