import { auth } from '@/auth';
import { getAccountSummary } from '@/lib/account-summary';

// GET /api/me
//
// 给前端展示“当前用户 + 当前套餐 + 剩余额度”。
// 注意：这个接口只读额度状态，不会增加 RateLimit.count。
// 真正扣次数的地方只应该在 /api/chat 里，避免用户刷新页面也消耗额度。
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }

  const summary = await getAccountSummary(session.user.id);

  if (!summary) {
    return Response.json({ error: '用户不存在' }, { status: 404 });
  }

  return Response.json(summary);
}
