import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth/session';
import { runWithAuth } from '@/lib/auth/with-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return runWithAuth(request, async () => {
    const response = NextResponse.json({ ok: true });
    clearAuthCookie(response);
    return response;
  });
}
