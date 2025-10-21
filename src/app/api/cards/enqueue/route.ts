// src/app/api/cards/enqueue/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
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

export async function POST(req: Request) {
  const payload = (await req.json()) as EnqueuePayload;
  const isAsync = IS_CLOUD_RUN && !FORCE_SYNC;

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

  // ✅ Local dev (or forced sync): generate now
  if (!isAsync) {
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

  // 🚀 Cloud Run: enqueue to Cloud Tasks (dynamic import to avoid Next bundling errors)
  try {
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    const client = new CloudTasksClient();

    const parent = client.queuePath(
      process.env.GCP_PROJECT_ID!,
      config.TASKS_LOCATION,
      config.TASKS_QUEUE
    );

    const handlerUrl = config.TASKS_HANDLER_URL!;
    const bodyJson = JSON.stringify(payload);

    const taskReq: any = {
      parent,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: handlerUrl,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(bodyJson).toString('base64'),
        },
      },
    };

    if (process.env.TASKS_SA_EMAIL) {
      taskReq.task.httpRequest.oidcToken = {
        serviceAccountEmail: process.env.TASKS_SA_EMAIL,
        audience: handlerUrl,
      };
    }

    const [task] = await client.createTask(taskReq);
    return NextResponse.json({ ok: true, mode: 'async', name: task.name });
  } catch (e: any) {
    console.error('[cards/enqueue] async enqueue failed', e);
    return NextResponse.json(
      { ok: false, error: 'enqueue-failed', details: e?.message || 'unknown' },
      { status: 500 }
    );
  }
}
