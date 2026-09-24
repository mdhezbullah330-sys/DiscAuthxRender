import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { required } from './config';

const COOKIE = '__Host-dv-session';
const STATE_COOKIE = '__Host-dv-state';

function secret() {
  return new TextEncoder().encode(required('AUTH_SECRET'));
}

export async function setSession(userId) {
  const token = await new SignJWT({ sub: userId, kind: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
}

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload?.sub ? { userId: String(payload.sub) } : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function issueOAuthState(extra = {}) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const token = await new SignJWT({ nonce, kind: 'oauth-state', ...extra })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret());
  const jar = await cookies();
  jar.set(STATE_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return nonce;
}

export async function verifyOAuthState(returnedState) {
  const jar = await cookies();
  const cookie = jar.get(STATE_COOKIE)?.value;
  if (!cookie || !returnedState) return false;
  try {
    const { payload } = await jwtVerify(cookie, secret());
    if (payload?.kind !== 'oauth-state' || payload?.nonce !== returnedState) return null;
    return payload;
  } catch {
    return false;
  }
}
