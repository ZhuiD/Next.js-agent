import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, ensureDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { signToken } from '@/lib/auth/jwt';
import { verifyPassword } from '@/lib/auth/password';
import { setAuthCookie } from '@/lib/auth/session';
import { authBodySchema, normalizeEmail } from '@/lib/auth/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await ensureDb();

    const body = await request.json();
    const parsed = authBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? '参数无效' },
        { status: 400 },
      );
    }

    const email = normalizeEmail(parsed.data.email);
    const { password } = parsed.data;

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = rows[0];
    if (!user) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    const token = await signToken({ userId: user.id, email: user.email });
    const response = NextResponse.json({ ok: true, email: user.email });
    setAuthCookie(response, token);
    return response;
  } catch (err) {
    console.error('[auth/login]', err);
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
