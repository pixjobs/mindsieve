// src/app/api/turns/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/context';
import { db } from '@/lib/firebaseAdmin';

export async function POST(req: Request) {
  try {
    const { sessionId, query, answer, sources } = await req.json();

    const { session } = await requireSession();

    if (session.sessionId !== sessionId) {
      // soft warning; not fatal
      console.warn('[turns.POST] session mismatch', {
        serverSession: session.sessionId,
        clientSession: sessionId,
      });
    }

    const ref = db.collection('turns').doc();
    await ref.set({
      id: ref.id,
      sessionId,
      query,
      answer,
      sources,
      createdAt: Date.now(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error: any) {
    console.error('[turns.POST] failed', error);
    return NextResponse.json(
      { error: 'Failed to create turn', details: error.message },
      { status: 500 },
    );
  }
}
