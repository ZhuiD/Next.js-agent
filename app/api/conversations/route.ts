// GET /api/conversations
//
// 学习要点（后端入门）：
// 1. 为什么鉴权在服务端做？
//    因为客户端的 JS 代码用户可以随意修改，任何"前端隐藏"的逻辑都不安全。
//    服务端鉴权才是真正的门锁。
//
// 2. Prisma findMany 是什么？
//    相当于 SQL 的 SELECT ... WHERE ... ORDER BY ... LIMIT
//    这里翻译成：SELECT id, title, updatedAt FROM Chat WHERE userId = ? ORDER BY updatedAt DESC LIMIT 50
//
// 3. Next.js Route Handler 的写法规范：
//    文件放在 app/api/**/route.ts，导出 GET / POST / DELETE 等函数即可。
//    框架自动把 GET /api/conversations 路由到这里的 GET 函数。

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  // 第一步：验证登录状态
  // auth() 读取 cookie 里的 session，返回当前用户信息；未登录时返回 null
  const session = await auth();

  if (!session?.user?.id) {
    // HTTP 401 = Unauthorized（未认证，没登录）
    return Response.json({ error: '请先登录' }, { status: 401 });
  }

  // 第二步：查询当前用户的对话列表
  // prisma.chat 对应数据库里的 Chat 表
  const conversations = await prisma.chat.findMany({
    where: { userId: session.user.id }, // 只查自己的
    orderBy: { updatedAt: 'desc' },     // 最近修改的排最前
    take: 50,                           // 最多取 50 条，避免数据过多
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
  });

  // 第三步：返回 JSON 响应（HTTP 200 默认）
  return Response.json(conversations);
}
