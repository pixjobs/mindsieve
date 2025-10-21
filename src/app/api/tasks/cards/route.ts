export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { generateAndStoreCard } from '@/server/cards/generate';

export async function POST(req: Request) {
  const payload = await req.json();
  if (!payload?.sessionId || !payload?.turnId) {
    return NextResponse.json({ error: 'sessionId and turnId required' }, { status: 400 });
  }
  const result = await generateAndStoreCard(payload);
  return NextResponse.json({ ok: true, ...result });
}
