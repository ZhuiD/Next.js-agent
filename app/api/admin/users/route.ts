// GET /api/admin/users — 查看所有用户列表
//
// 这是管理员专用接口，用于：
// 1. 查看哪些用户在使用系统
// 2. 了解各用户的当前套餐
// 3. 配合 PATCH /api/admin/users/[id] 手动升级用户权限
//
// 学习要点：
// "中间件" vs "函数内鉴权"
// Express/Koa 有中间件机制可以复用鉴权逻辑，
// Next.js Route Handler 没有，所以直接在函数开头检查权限。
// 对于少量 admin 接口，这比引入 middleware.ts 更直接。

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }

  // 查当前用户的 plan，只有 admin 才能访问
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  if (currentUser?.plan !== 'admin') {
    return Response.json({ error: '无权访问' }, { status: 403 });
  }

  // 返回所有用户的基本信息 + 套餐 + 限流状态
  const users = await prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      plan: true,
      // 同时查出当前的限流记录，方便管理员了解各用户的使用情况
      rateLimit: {
        select: { count: true, windowStart: true },
      },
    },
  });

  return Response.json(users);
}
