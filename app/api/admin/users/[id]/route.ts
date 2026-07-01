// PATCH /api/admin/users/[id] — 修改用户套餐
//
// 这是"手动开通付费权限"的接口。
// 当用户付款后（或你想给某个用户开绿灯），管理员调用这个接口把 plan 改成 "pro"。
//
// 将来接入 Stripe 后，Stripe 的 Webhook 会自动调用类似的逻辑，
// 不再需要人工操作，但底层的 prisma.user.update 是一样的。

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const VALID_PLANS = ['free', 'pro', 'admin'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }

  // 只有 admin 才能修改其他用户的套餐
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  if (currentUser?.plan !== 'admin') {
    return Response.json({ error: '无权操作' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { plan } = body as { plan?: string };

  // 校验传入的 plan 值是否合法，防止写入非法数据
  if (!plan || !VALID_PLANS.includes(plan)) {
    return Response.json(
      { error: `plan 必须是 ${VALID_PLANS.join(' / ')} 之一` },
      { status: 400 },
    );
  }

  // 确认目标用户存在
  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, plan: true },
  });

  if (!targetUser) {
    return Response.json({ error: '用户不存在' }, { status: 404 });
  }

  // 更新套餐
  const updated = await prisma.user.update({
    where: { id },
    data: { plan },
    select: { id: true, name: true, email: true, plan: true },
  });

  return Response.json({
    ok: true,
    user: updated,
    message: `已将 ${updated.name ?? updated.email} 的套餐从 ${targetUser.plan} 改为 ${plan}`,
  });
}
