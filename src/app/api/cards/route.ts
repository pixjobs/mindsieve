// src/app/api/cards/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

/**
 * Query params:
 *  - sessionId (required)
 *  - turnId (optional)
 *  - limit (optional, default 60, max 200)
 *  - cursor (optional: number; createdAt of last item from previous page)
 *
 * Response:
 *  { cards: Card[], nextCursor?: number, warning?: 'missing_index' }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const sessionId = searchParams.get('sessionId') || '';
  const turnId = searchParams.get('turnId') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '60', 10), 200);
  const cursor = searchParams.get('cursor');
  const cursorNum = cursor ? Number(cursor) : undefined;

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  // Helper to run the fast (indexed) query
  const runIndexed = async () => {
    let q: FirebaseFirestore.Query = db.collection('study_cards').where('sessionId', '==', sessionId);
    if (turnId) q = q.where('turnId', '==', turnId);

    // Order by createdAt desc for pagination / UI recency
    q = q.orderBy('createdAt', 'desc');

    if (Number.isFinite(cursorNum)) {
      // Works with single-field order; requires composite index with filters.
      q = q.startAfter(cursorNum as number);
    }

    q = q.limit(limit);

    const snap = await q.get();
    const cards = snap.docs.map((d) => d.data() as any);
    const nextCursor = cards.length === limit ? cards[cards.length - 1]?.createdAt : undefined;

    return NextResponse.json({ cards, ...(nextCursor ? { nextCursor } : {}) });
  };

  // Helper to run a fallback when composite index is missing
  const runFallback = async () => {
    // Fetch with filters only, sort/paginate in memory (OK for dev; avoid for very large sets)
    let q: FirebaseFirestore.Query = db.collection('study_cards').where('sessionId', '==', sessionId);
    if (turnId) q = q.where('turnId', '==', turnId);

    const snap = await q.get();
    let all = snap.docs.map((d) => d.data() as any);

    all = all
      .filter((x) => typeof x.createdAt === 'number')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (Number.isFinite(cursorNum)) {
      all = all.filter((x) => x.createdAt < (cursorNum as number));
    }

    const sliced = all.slice(0, limit);
    const nextCursor = sliced.length === limit ? sliced[sliced.length - 1]?.createdAt : undefined;

    return NextResponse.json({ cards: sliced, ...(nextCursor ? { nextCursor } : {}), warning: 'missing_index' });
  };

  try {
    return await runIndexed();
  } catch (e: any) {
    // Firestore throws code=9 FAILED_PRECONDITION when a composite index is missing
    const code = e?.code;
    const msg = String(e?.message || '');
    const needsIndex = code === 9 || /FAILED_PRECONDITION|index/i.test(msg);

    if (needsIndex) {
      console.warn('[cards.GET] missing composite index; using in-memory fallback.', { sessionId, turnId, limit });
      return await runFallback();
    }

    console.error('[cards.GET] failed', e);
    return NextResponse.json({ error: 'internal', details: e?.message || 'unknown' }, { status: 500 });
  }
}
