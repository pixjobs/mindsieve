// src/app/api/cards/enqueue/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { IS_CLOUD_RUN, FORCE_SYNC } from '@/lib/env';
import * as config from '@/config';
import { generateAndStoreCard } from '@/server/cards/generate';

type EnqueuePayload = {
  sessionId: string;
  turnId: string;
  answer: string;
  sources: { id: number; title: string; arxiv_id?: string }[];
  topic?: string;
  fromQuery?: string;
  ownerUid?: string | null;
};

// ---- Cloud Tasks (REST) ----
async function enqueueViaRest(payload: any) {
  const project = process.env.GCP_PROJECT_ID!;
  const location = config.TASKS_LOCATION;        // e.g. "europe-west1"
  const queue = config.TASKS_QUEUE;              // e.g. "card-jobs"
  const handlerUrl = config.TASKS_HANDLER_URL!;  // full https to /api/cards/worker

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const token = await auth.getAccessToken();

  const body = {
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: handlerUrl,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        ...(process.env.TASKS_SA_EMAIL
          ? { oidcToken: { serviceAccountEmail: process.env.TASKS_SA_EMAIL, audience: handlerUrl } }
          : {}),
      },
    },
  };

  const endpoint = `https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${location}/queues/${queue}/tasks`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Cloud Tasks REST ${resp.status}: ${txt}`);
  }
  return resp.json();
}

export async function POST(req: Request) {
  let payload: EnqueuePayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
  }

  // Basic validation
  if (!payload?.sessionId) {
    return NextResponse.json({ ok: false, error: 'sessionId required' }, { status: 400 });
  }
  if (!payload?.turnId) {
    return NextResponse.json({ ok: false, error: 'turnId required' }, { status: 400 });
  }
  if (!payload?.answer || !Array.isArray(payload?.sources)) {
    return NextResponse.json({ ok: false, error: 'answer & sources required' }, { status: 400 });
  }

  const doAsync = IS_CLOUD_RUN && !FORCE_SYNC;

  // Try async enqueue first (Cloud Run), then sync fallback
  if (doAsync) {
    try {
      const task = await enqueueViaRest(payload);
      return NextResponse.json({ ok: true, mode: 'async', task });
    } catch (e: any) {
      console.warn('[cards/enqueue] REST enqueue failed; falling back to sync', e?.message || e);
    }
  }

  // Sync path
  try {
    const result = await generateAndStoreCard(payload);
    return NextResponse.json({ ok: true, mode: 'sync', ...result });
  } catch (e: any) {
    console.error('[cards/enqueue] sync failed', e);
    return NextResponse.json(
      { ok: false, error: 'sync-failed', details: e?.message || 'unknown' },
      { status: 500 }
    );
  }
}
