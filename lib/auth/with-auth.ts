import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from './constants';
import { authContext } from './context';
import type { AuthPayload } from './jwt';
import { verifyToken } from './jwt';

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;

  for (const segment of header.split(';')) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(segment.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/** 从 Request Cookie 解析并验证 JWT */
export async function getSessionFromRequest(
  request: Request,
): Promise<AuthPayload | null> {
  const token = readCookie(request, AUTH_COOKIE);
  if (!token) return null;
  return verifyToken(token);
}

type AuthHandler<T> = (session: AuthPayload) => Promise<T>;

/**
 * 鉴权通过后，将用户信息绑定到 AsyncLocalStorage，再执行业务逻辑。
 * 未登录返回 401。
 */
export async function runWithAuth<T>(
  request: Request,
  handler: AuthHandler<T>,
): Promise<T | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
  }

  return authContext.run(session, () => handler(session));
}
