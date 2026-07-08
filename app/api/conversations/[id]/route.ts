// GET /api/conversations/[id]  — 读取单个对话及消息记录
// DELETE /api/conversations/[id] — 删除对话（消息级联删除）
//
// 学习要点（后端入门）：
// 1. [id] 动态路由：文件夹名用方括号包裹，框架把 URL 里的实际值传进 params
//    例如 GET /api/conversations/abc123 → params.id = "abc123"
//
// 2. 为什么要校验归属？
//    光有登录不够——用户 A 可能猜到用户 B 的对话 ID 然后发请求。
//    必须在服务端比对 chat.userId === session.user.id，才能确保数据隔离。
//
// 3. Prisma findUnique vs findMany：
//    findUnique — 按唯一字段查一条（没找到返回 null）
//    findMany   — 按条件查多条

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// ─── GET /api/conversations/[id] ───────────────────────────────────────────────
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }

  const { id } = await params;

  // 查对话，同时用 include 关联查出它的所有消息
  // 相当于 SQL 的 JOIN：SELECT * FROM Chat JOIN Message ON ... WHERE Chat.id = ?
  const conversation = await prisma.chat.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' }, // 按时间正序，还原对话顺序
      },
    },
  });

  // 对话不存在，或者不属于当前用户
  if (!conversation) {
    return Response.json({ error: '对话不存在' }, { status: 404 });
  }
  if (conversation.userId !== session.user.id) {
    // HTTP 403 = Forbidden（已认证，但没权限）
    // 注意区分：401 = 没登录，403 = 登录了但没权限
    return Response.json({ error: '无权访问' }, { status: 403 });
  }

  // 把 partsJson 字符串反序列化为对象，供前端直接使用
  const messages = conversation.messages.map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    // partsJson 存的是 AI SDK 的完整消息结构（含 tool calls 等）
    // 如果为空就降级到纯文本格式
    parts: msg.partsJson
      ? JSON.parse(msg.partsJson)
      : [{ type: 'text', text: msg.content }],
  }));

  return Response.json({
    id: conversation.id,
    title: conversation.title,
    messages,
  });
}

// ─── DELETE /api/conversations/[id] ────────────────────────────────────────────
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }

  const { id } = await params;

  // 先查一下，确认存在且属于自己，再删
  const conversation = await prisma.chat.findUnique({
    where: { id },
    select: { userId: true }, // 只取 userId，节省查询量
  });

  if (!conversation) {
    return Response.json({ error: '对话不存在' }, { status: 404 });
  }
  if (conversation.userId !== session.user.id) {
    return Response.json({ error: '无权删除' }, { status: 403 });
  }

  // 删除对话。因为 Prisma schema 里 Message 设置了 onDelete: Cascade，
  // 所以删 Chat 时关联的所有 Message 会自动一并删除，无需手动处理。
  await prisma.chat.delete({ where: { id } });

  return Response.json({ ok: true });
}
