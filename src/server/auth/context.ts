// src/server/auth/context.ts
import crypto from 'crypto';
import { cookies as nextCookies, headers as nextHeaders } from 'next/headers';
import { db } from '@/lib/firebaseAdmin';

export const COOKIE_ANON_ID = 'ms_anon_id';
export const COOKIE_SESSION_ID = 'ms_session_id';
export const COOKIE_SESSION_KEY = 'ms_session_key';

type UserContext = {
  uid?: string;      // When Identity Platform is enabled
  anonId?: string;   // Anonymous browser id (cookie)
};

type SessionState = {
  sessionId: string;
  sessionKey: string;
};

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
function newId() {
  return crypto.randomUUID();
}

function newKey() {
  return crypto.randomBytes(24).toString('hex');
}

const ninetyDays = 60 * 60 * 24 * 90;
const commonCookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: ninetyDays,
};

// ────────────────────────────────────────────────
// User context (reads cookies + headers)
// ────────────────────────────────────────────────
export async function getUserContext(): Promise<{
  user: UserContext;
  fromClient: { sessionId?: string; sessionKey?: string };
}> {
  const cookieStore = await nextCookies();
  const hdrs = await nextHeaders();

  const anonId = cookieStore.get(COOKIE_ANON_ID)?.value || undefined;
  const authz = hdrs.get('authorization') || undefined;

  // Later, decode Firebase ID token here (for uid)
  const user: UserContext = { anonId };

  const fromClient = {
    sessionId:
      hdrs.get('x-session-id') || cookieStore.get(COOKIE_SESSION_ID)?.value || undefined,
    sessionKey:
      hdrs.get('x-session-key') || cookieStore.get(COOKIE_SESSION_KEY)?.value || undefined,
  };

  return { user, fromClient };
}

// ────────────────────────────────────────────────
// Ensure a valid server-owned session
// ────────────────────────────────────────────────
export async function ensureSession(): Promise<{
  user: UserContext;
  session: SessionState;
}> {
  const cookieStore = await nextCookies();

  let sessionId = cookieStore.get(COOKIE_SESSION_ID)?.value;
  let sessionKey = cookieStore.get(COOKIE_SESSION_KEY)?.value;
  let anonId = cookieStore.get(COOKIE_ANON_ID)?.value;

  // Create anon id if missing
  if (!anonId) {
    anonId = newId();
    cookieStore.set(COOKIE_ANON_ID, anonId, commonCookieOpts);
  }

  const sessionsCol = db.collection('sessions');

  if (!sessionId || !sessionKey) {
    sessionId = newId();
    sessionKey = newKey();

    const now = Date.now();
    const sessionDoc = {
      id: sessionId,
      owner: { uid: null, anonId },
      sessionKey,
      createdAt: now,
      updatedAt: now,
      archived: false,
    };

    await sessionsCol.doc(sessionId).set(sessionDoc);

    cookieStore.set(COOKIE_SESSION_ID, sessionId, commonCookieOpts);
    cookieStore.set(COOKIE_SESSION_KEY, sessionKey, commonCookieOpts);
  } else {
    // Touch timestamp to keep it warm
    await sessionsCol.doc(sessionId).set({ updatedAt: Date.now() }, { merge: true });
  }

  const user: UserContext = { anonId };
  const session: SessionState = { sessionId, sessionKey };
  return { user, session };
}

// ────────────────────────────────────────────────
// Public entrypoint for routes
// ────────────────────────────────────────────────
export async function requireSession() {
  const { user, session } = await ensureSession();
  return { user, session };
}

// ────────────────────────────────────────────────
// Ownership checks (soft for now, can be strict later)
// ────────────────────────────────────────────────
export async function assertOwnership(sessionId: string) {
  const { session } = await requireSession();
  if (session.sessionId !== sessionId) {
    console.warn('[auth] session mismatch', { expected: session.sessionId, got: sessionId });
    // throw new Error('session mismatch'); // ← uncomment to enforce strict mode
    return false;
  }
  return true;
}
