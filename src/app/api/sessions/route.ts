export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/context';

export async function POST() {
  try {
    const { session } = await requireSession();
    return NextResponse.json({ sessionId: session.sessionId, sessionKey: session.sessionKey });
  } catch (e: any) {
    console.error('[sessions.POST] failed', e);
    return NextResponse.json(
      { error: 'session-init-failed', details: e?.message || 'unknown' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { sessionId } = await req.json().catch(() => ({}));
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    // touching happens inside requireSession usually, but keep this if you want manual updates
    const { session } = await requireSession();
    if (session.sessionId !== sessionId) {
      console.warn('[sessions.PATCH] session mismatch', { got: sessionId, have: session.sessionId });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[sessions.PATCH] failed', e);
    return NextResponse.json({ error: 'patch-failed', details: e?.message || 'unknown' }, { status: 500 });
  }
}
