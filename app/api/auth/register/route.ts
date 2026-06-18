import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, ensureDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { signToken } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
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

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await db.insert(users).values({
      id,
      email,
      passwordHash,
      createdAt: new Date(),
    });

    const token = await signToken({ userId: id, email });
    const response = NextResponse.json({ ok: true, email });
    setAuthCookie(response, token);
    return response;
  } catch (err) {
    console.error('[auth/register]', err);
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
  }
}
