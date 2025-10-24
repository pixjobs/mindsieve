// src/app/api/cards/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { requireSession } from '@/server/auth/context';

type Cursor = { createdAt: number; id: string };

function parseBool(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  if (v === '1' || v.toLowerCase() === 'true') return true;
  if (v === '0' || v.toLowerCase() === 'false') return false;
  return undefined;
}

/**
 * Query params:
 *  - sessionId (required) – must match server session (soft check; logs on mismatch)
 *  - turnId (optional)
 *  - pinnedOnly (optional: true/false)
 *  - since (optional: number ms since epoch; filters createdAt >= since)
 *  - limit (optional: default 60, max 200)
 *  - cursorCreatedAt (optional: number) + cursorId (optional: string) – stable pagination
 *
 * Response:
 *  { cards: Card[], nextCursor?: { createdAt: number, id: string }, warning?: 'missing_index' }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const sessionId = searchParams.get('sessionId') || '';
  const turnId = searchParams.get('turnId') || undefined;
  const pinnedOnly = parseBool(searchParams.get('pinnedOnly'));
  const since = searchParams.get('since');
  const sinceNum = since ? Number(since) : undefined;

  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '60', 10), 200));

  const cursorCreatedAt = searchParams.get('cursorCreatedAt');
  const cursorId = searchParams.get('cursorId');
  const hasCursor = cursorCreatedAt && cursorId;
  const cursor: Cursor | undefined =
    hasCursor ? { createdAt: Number(cursorCreatedAt), id: String(cursorId) } : undefined;

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  // Soft ownership check
  try {
    const { session } = await requireSession();
    if (session.sessionId !== sessionId) {
      console.warn('[cards.GET] session mismatch', { serverSessionId: session.sessionId, clientSessionId: sessionId });
    }
  } catch (e) {
    // Don’t block reads on session failure; log only
    console.warn('[cards.GET] requireSession failed (continuing)', e);
  }

  // ------- Indexed path (preferred) -------
  const runIndexed = async () => {
    let q: FirebaseFirestore.Query = db.collection('study_cards')
      .where('sessionId', '==', sessionId);

    if (turnId) q = q.where('turnId', '==', turnId);
    if (pinnedOnly === true) q = q.where('pinned', '==', true);
    if (Number.isFinite(sinceNum)) q = q.where('createdAt', '>=', sinceNum as number);

    // Stable pagination: createdAt desc, then id desc
    q = q.orderBy('createdAt', 'desc').orderBy('id', 'desc');

    if (cursor) {
      // startAfter takes field values in the same order as orderBy
      q = q.startAfter(cursor.createdAt, cursor.id);
    }

    q = q.limit(limit);

    const snap = await q.get();
    const cards = snap.docs.map((d) => d.data() as any);

    // Compute next cursor if we filled the page
    let nextCursor: Cursor | undefined;
    if (cards.length === limit) {
      const last = cards[cards.length - 1];
      if (last?.createdAt && last?.id) {
        nextCursor = { createdAt: last.createdAt, id: last.id };
      }
    }

    return NextResponse.json(
      { cards, ...(nextCursor ? { nextCursor } : {}) },
      {
        headers: {
          'Cache-Control': 'no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      },
    );
  };

  // ------- Fallback (no composite index) -------
  const runFallback = async () => {
    let q: FirebaseFirestore.Query = db.collection('study_cards').where('sessionId', '==', sessionId);
    if (turnId) q = q.where('turnId', '==', turnId);
    if (pinnedOnly === true) q = q.where('pinned', '==', true);
    // cannot push since filter here safely without index → filter in memory

    const snap = await q.get();
    let all = snap.docs.map((d) => d.data() as any);

    // in-memory filters & sort
    all = all
      .filter((x) => typeof x.createdAt === 'number')
      .filter((x) => (Number.isFinite(sinceNum) ? x.createdAt >= (sinceNum as number) : true))
      .sort((a, b) => {
        if (b.createdAt !== a.createdAt) return (b.createdAt || 0) - (a.createdAt || 0);
        return (b.id || '').localeCompare(a.id || '');
      });

    if (cursor) {
      all = all.filter((x) => {
        if (x.createdAt < cursor.createdAt) return true;
        if (x.createdAt > cursor.createdAt) return false;
        return (x.id || '') < cursor.id; // because we sort desc
      });
    }

    const sliced = all.slice(0, limit);
    let nextCursor: Cursor | undefined;
    if (sliced.length === limit) {
      const last = sliced[sliced.length - 1];
      if (last?.createdAt && last?.id) nextCursor = { createdAt: last.createdAt, id: last.id };
    }

    return NextResponse.json(
      { cards: sliced, ...(nextCursor ? { nextCursor } : {}), warning: 'missing_index' },
      {
        headers: {
          'Cache-Control': 'no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      },
    );
  };

  try {
    return await runIndexed();
  } catch (e: any) {
    const code = e?.code;
    const msg = String(e?.message || '');
    const needsIndex = code === 9 || /FAILED_PRECONDITION|index/i.test(msg);
    if (needsIndex) {
      console.warn('[cards.GET] missing composite index; using in-memory fallback.', {
        sessionId,
        turnId,
        limit,
        pinnedOnly,
        since: sinceNum,
      });
      return await runFallback();
    }
    console.error('[cards.GET] failed', e);
    return NextResponse.json({ error: 'internal', details: e?.message || 'unknown' }, { status: 500 });
  }
}
