import { SignJWT, jwtVerify } from 'jose';
import { AUTH_MAX_AGE_SEC } from './constants';

export type AuthPayload = {
  userId: string;
  email: string;
};

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET 未配置，请在 .env.local 中设置');
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${AUTH_MAX_AGE_SEC}s`)
    .sign(getSecretKey());
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );

    if (typeof payload.sub !== 'string') return null;
    if (typeof payload.email !== 'string') return null;

    return {
      userId: payload.sub,
      email: payload.email,
    };
  } catch {
    return null;
  }
}
