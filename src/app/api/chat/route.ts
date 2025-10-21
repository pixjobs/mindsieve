// src/app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { VertexAI } from '@google-cloud/vertexai';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { GoogleAuth } from 'google-auth-library';
import * as config from '@/config';
import { requireSession } from '@/server/auth/context';
import { enhanceQuery } from '@/server/chat/enhancer';

/** ── Answer length / stream caps ───────────────────────── */
const STREAM_CHAR_CAP   = Number(process.env.CHAT_CHAR_CAP || 9000);     // keep UI snappy

/** ── Logging helpers ───────────────────────────────────── */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const ts  = () => new Date().toISOString();
const j   = (o: any) => JSON.stringify(o);
function logStart(step: string, reqId: string, extra: Record<string, unknown> = {}) { console.info(j({ ts: ts(), level: 'INFO', reqId, event: 'STEP_START', step, ...extra })); }
function logEnd(step: string, reqId: string, ms: number, extra: Record<string, unknown> = {}) { console.info(j({ ts: ts(), level: 'INFO', reqId, event: 'STEP_END', step, duration_ms: ms, ...extra })); }
function logInfo(msg: string, reqId: string, extra: Record<string, unknown> = {}) { console.info(j({ ts: ts(), level: 'INFO', reqId, msg, ...extra })); }
function logWarn(msg: string, reqId: string, extra: Record<string, unknown> = {}) { console.warn(j({ ts: ts(), level: 'WARN', reqId, msg, ...extra })); }
function logError(msg: string, reqId: string, error?: unknown, extra: Record<string, unknown> = {}) { console.error(j({ ts: ts(), level: 'ERROR', reqId, msg, error: serializeError(error), ...extra })); }
function serializeError(e: unknown) {
  if (!e) return null;
  if (e instanceof Error) {
    const anyErr = e as any;
    return { name: e.name, message: e.message, stack: e.stack, code: anyErr.code, status: anyErr.status, details: anyErr.details, reason: anyErr.reason };
  }
  return e;
}
async function timed<T>(step: string, reqId: string, fn: () => Promise<T>): Promise<T> {
  const t0 = now(); logStart(step, reqId);
  try { const out = await fn(); logEnd(step, reqId, now() - t0); return out; }
  catch (err) { logError(`Step failed: ${step}`, reqId, err); throw err; }
}

/** ── Clients (singletons) ──────────────────────────────── */
let clients: { vertexAI: VertexAI; esClient: ElasticsearchClient } | null = null;

let secretCache: { esUrl: string; esApiKey: string } | null = null;
let fetchingSecrets = false;
let secretWaiters: Array<(v: typeof secretCache) => void> = [];

async function getSecrets(reqId: string): Promise<{ esUrl: string; esApiKey: string }> {
  if (secretCache) return secretCache!;
  if (fetchingSecrets) return new Promise(res => secretWaiters.push(res));
  fetchingSecrets = true;

  const sm = new SecretManagerServiceClient();
  const read = async (name: string) => {
    const [v] = await sm.accessSecretVersion({ name: `projects/${config.GCP_PROJECT_ID}/secrets/${name}/versions/latest` });
    const s = v.payload?.data?.toString();
    if (!s) throw new Error(`Secret ${name} is empty`);
    return s;
  };

  const [esUrl, esApiKey] = await Promise.all([ read(config.ES_URL_SECRET_NAME), read(config.ES_API_KEY_SECRET_NAME) ]);
  secretCache = { esUrl, esApiKey };
  fetchingSecrets = false;
  secretWaiters.forEach(fn => fn(secretCache));
  secretWaiters = [];
  logInfo('Secrets cached in memory', reqId);
  return secretCache!;
}

async function initializeClients(reqId: string) {
  if (clients) { logInfo('Reusing initialized clients', reqId); return clients!; }
  logInfo('Initializing clients...', reqId, { projectId: config.GCP_PROJECT_ID, region: config.GCP_REGION });

  const { esUrl, esApiKey } = await getSecrets(reqId);

  const vertexAI = await timed('vertex_ai.init', reqId, async () =>
    new VertexAI({ project: config.GCP_PROJECT_ID, location: config.GCP_REGION }) // ADC
  );

  const esClient = await timed('elasticsearch.init', reqId, async () => {
    const client = new ElasticsearchClient({ node: esUrl, auth: { apiKey: esApiKey } });
    await client.ping(); logInfo('Elasticsearch ping ok', reqId, { node: esUrl }); return client;
  });

  clients = { vertexAI, esClient };
  logInfo('Clients initialized.', reqId);
  return clients!;
}

/** ── Embeddings (robust REST with regional fallback) ───── */
async function getEmbeddingModel(_: VertexAI, reqId: string) {
  logWarn('Embedding SDK unavailable; will use REST endpoints', reqId);
  return {
    async embedContent({ content }: { content: { role: string; parts: { text: string }[] } }) {
      const text = content?.parts?.[0]?.text ?? '';
      return await embedViaRestRobust(text, reqId);
    },
    __restFallback: true,
  };
}

async function embedViaRestRobust(text: string, reqId: string) {
  return timed('vertex_ai.embed_rest', reqId, async () => {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const token = await auth.getAccessToken();
    const regions = [config.GCP_REGION, 'europe-west4'];
    const model = config.EMBEDDING_MODEL_NAME;

    let payloadText = (text || '').trim();
    if (payloadText.length > 5000) payloadText = payloadText.slice(0, 5000);

    for (const region of regions) {
      try {
        // Prefer :embedText
        const url1 = `https://${region}-aiplatform.googleapis.com/v1/projects/${config.GCP_PROJECT_ID}/locations/${region}/publishers/google/models/${model}:embedText`;
        const r1 = await fetch(url1, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: payloadText }) });
        if (r1.ok) {
          const d: any = await r1.json();
          const values: number[] = d?.embedding?.values || d?.predictions?.[0]?.embedding?.values || d?.predictions?.[0]?.embeddings?.values;
          if (Array.isArray(values) && values.length) { logInfo('Embeddings OK via :embedText', reqId, { region, dims: values.length }); return { embedding: { values } }; }
        } else {
          const body = await r1.text().catch(() => ''); logWarn('embedText failed; will try :predict or next region', reqId, { via: ':embedText', region, status: r1.status, body });
        }
      } catch (e) { logWarn('embedText threw; will try :predict or next region', reqId, { via: ':embedText', region, err: serializeError(e) }); }

      try {
        // Fallback :predict
        const url2 = `https://${region}-aiplatform.googleapis.com/v1/projects/${config.GCP_PROJECT_ID}/locations/${region}/publishers/google/models/${model}:predict`;
        const r2 = await fetch(url2, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [{ content: payloadText }], parameters: { autoTruncate: true } }) });
        if (r2.ok) {
          const d: any = await r2.json();
          const values: number[] = d?.predictions?.[0]?.embedding?.values || d?.predictions?.[0]?.embeddings?.values;
          if (Array.isArray(values) && values.length) { logInfo('Embeddings OK via :predict', reqId, { region, dims: values.length }); return { embedding: { values } }; }
        } else {
          const body = await r2.text().catch(() => ''); logWarn('predict failed; trying next region', reqId, { via: ':predict', region, status: r2.status, body });
        }
      } catch (e) { logWarn('predict threw; trying next region', reqId, { via: ':predict', region, err: serializeError(e) }); }
    }

    logError('All embedding attempts failed', reqId, undefined, { model, triedRegions: regions });
    throw new Error('Failed to generate text embedding from Vertex AI. Check API enablement/region/ADC.');
  });
}

async function getEmbedding(text: string, embeddingModel: any, reqId: string): Promise<number[]> {
  return timed('vertex_ai.embed', reqId, async () => {
    try {
      const res = await embeddingModel.embedContent({ content: { role: 'user', parts: [{ text }] } });
      const values = (res as any)?.embedding?.values || (res as any)?.embeddings?.[0]?.values || (Array.isArray(res) ? res : null);
      if (Array.isArray(values) && values.length > 0) return values as number[];
      throw new Error('Vertex returned no embedding vector.');
    } catch (error) {
      logError('Vertex AI embedding API failed', reqId, error, { embeddingModel: config.EMBEDDING_MODEL_NAME, region: config.GCP_REGION });
      throw new Error('Failed to generate text embedding from Vertex AI.');
    }
  });
}

/** ── Tutor prompt (short, structured, follow-ups; no # headings) ───────── */
function buildFinalPrompt(query: string, groundingJson: string): string {
  return `You are a friendly **Computer Science tutor**. Write a concise answer that uses the SOURCES JSON (snippets from arXiv papers).
Start directly with **Introduction** (no greetings or meta commentary). Use bold section labels (e.g., **Introduction**) instead of markdown headings.

**Style & constraints**
- Keep it succinct overall (~6–10 sentences across core sections).
- Be beginner-first, then add clearly labeled expert notes.
- Cite sources inline as [N] whenever used.
- Use Markdown only (no raw HTML).
- If sources are insufficient for any part, prefix that part with **General Knowledge:** and continue.

**Sections (use these exact bold labels, in order)**

**Introduction**
1–2 sentence plain-language overview of the concept and why it matters.

**Core idea**
Up to 3 sentences explaining the concept simply (analogy allowed). Add inline citations like [1], [2] when used.

**Expert notes**
1–3 short bullets for advanced readers (edge cases, variants, algorithms). Cite where used.

**Quick check**
Two one-line self-test questions (no answers).

**Suggested follow-ups**
4–6 bullet topics to explore next (progressing from basics → advanced).

SOURCES (JSON):
${groundingJson}

QUESTION:
${query}`;
}


/** ── Follow-ups from enhancer keywords (for UI chips) ──── */
function followupsFromKeywords(keywords: string[] = []): string[] {
  const base = (keywords || []).map(k => String(k).trim()).filter(Boolean).slice(0, 6);
  const buckets = [
    (t: string) => `Foundations of ${t}`,
    (t: string) => `${t}: worked example`,
    (t: string) => `${t} vs alternatives`,
    (t: string) => `Common pitfalls in ${t}`,
    (t: string) => `When (not) to use ${t}`,
    (t: string) => `Advanced ${t}: optimization/scale`,
  ];
  const out: string[] = [];
  for (let i = 0; i < base.length; i++) {
    out.push(buckets[i % buckets.length](base[i]));
  }
  return out.slice(0, 6);
}

/** ── HTTP handler (POST) ───────────────────────────────── */
export async function POST(req: Request) {
  const reqId = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? (globalThis.crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);

  const { session } = await requireSession();
  let clientProvidedSessionId: string | undefined;
  let assistantId: string | undefined;

  logInfo('Incoming request', reqId, {
    region: config.GCP_REGION,
    projectId: config.GCP_PROJECT_ID,
    generativeModel: config.GENERATIVE_MODEL_NAME,
    embeddingModel: config.EMBEDDING_MODEL_NAME,
    index: config.ES_INDEX,
  });

  try {
    const { query, sessionId, turnId, assistantId: aId } = await timed('request.parse_body', reqId, async () => await req.json());
    clientProvidedSessionId = sessionId;
    assistantId = turnId || aId;

    if (!query || typeof query !== 'string') {
      logWarn('Invalid query payload', reqId, { queryType: typeof query });
      return NextResponse.json({ error: 'Query is required and must be a string.' }, { status: 400 });
    }
    if (clientProvidedSessionId && clientProvidedSessionId !== session.sessionId) {
      logWarn('Client sessionId differs from server session', reqId, { clientProvidedSessionId, serverSessionId: session.sessionId });
    }

    // 1) Clients
    const { vertexAI, esClient } = await initializeClients(reqId);

    // 2) Models
    const generativeModel = await timed('vertex_ai.get_generative_model', reqId, async () =>
      vertexAI.getGenerativeModel({ model: config.GENERATIVE_MODEL_NAME })
    );
    const embeddingModel = await timed('vertex_ai.get_embedding_model', reqId, async () =>
      getEmbeddingModel(vertexAI, reqId)
    );

    // 3) Enhance (guarded helper)
    const enhance = await enhanceQuery(query, generativeModel);
    if ('blocked' in enhance && enhance.blocked) {
      return NextResponse.json({ error: 'blocked', reason: enhance.reason, reqId }, { status: 400 });
    }
    const enhancedQuery = enhance.hypothetical;

    // 4) Embedding
    const queryVector = await getEmbedding(enhancedQuery, embeddingModel, reqId);

    // 5) Hybrid search (text + vector + RRF)
    const searchResponse = await timed('elasticsearch.search', reqId, async () =>
      esClient.search({
        index: config.ES_INDEX,
        size: config.TOP_K,
        _source: ['title', 'abstract', 'summary', 'published', 'authors', 'article_url', 'arxiv_id'],
        query: {
          bool: {
            should: [
              { multi_match: { query: enhancedQuery, fields: ['title^3', 'abstract', 'summary'], fuzziness: 'AUTO' } },
            ],
            minimum_should_match: 1,
          },
        },
        knn: { field: config.VECTOR_FIELD, query_vector: queryVector, k: config.TOP_K, num_candidates: 80 },
        rank: { rrf: { rank_window_size: 128, rank_constant: 20 } },
        highlight: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fields: { abstract: {}, summary: {} } },
      })
    );

    let hits: any[] = (searchResponse as any)?.hits?.hits ?? [];
    logInfo('Search results', reqId, { totalHits: hits.length });

    // 5b) Light domain filter (reduce off-topic bleed)
    const topicRe = /(arxiv|transformer|neural|attention|graph|retrieval|optimization|vision|nlp|compiler|algorithm|complexity|systems|database|query|index|network|protocol)/i;
    const filtered = hits.filter(h => {
      const s = h._source || {};
      return topicRe.test(s?.title || '') || topicRe.test(s?.abstract || s?.summary || '');
    });
    if (filtered.length >= 3) hits = filtered;

    if (hits.length === 0) {
      const answer = "I couldn't find any specific documents in my arXiv knowledge base for your query. Please try rephrasing.";
      const sourcesJson = JSON.stringify([]);
      const metaJson = JSON.stringify({
        format: 'markdown',
        links: [],
        followups: followupsFromKeywords((enhance as any).keywords || []),
        anim: { enter: 'stagger-fade' },
      });
      return new Response(sourcesJson + '|||SOURCES|||' + metaJson + '|||META|||' + answer, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Request-Id': reqId,
          'X-Session-Id': session.sessionId,
          ...(assistantId ? { 'X-Turn-Id': assistantId } : {}),
          'X-Model': config.GENERATIVE_MODEL_NAME,
        },
      });
    }

    // 6) Format sources & prompt
    const MAX_SNIPPETS = Math.max(3, Math.min(config.MAX_SNIPPETS || 6, 10));
    const MAX_CHARS    = Math.max(280, Math.min(config.MAX_CHARS_PER_SNIPPET || 600, 1200));

    const topDocs = hits.slice(0, MAX_SNIPPETS);
    const sourceItems = topDocs.map((hit: any, i: number) => {
      const source = hit._source;
      const highlight = hit.highlight?.abstract?.[0] || hit.highlight?.summary?.[0];
      const raw = source.abstract || source.summary || '';
      const snippetRaw = (highlight || raw).slice(0, MAX_CHARS);
      const snippet = (snippetRaw || '').replace(/<mark>/g, '**').replace(/<\/mark>/g, '**');
      return {
        id: i + 1,
        title: source.title,
        link: source.article_url,
        published: (source.published || '').toString().split('T')[0],
        snippet: snippet.endsWith('...') ? snippet : snippet + (snippet.length >= MAX_CHARS ? '...' : ''),
        arxiv_id: source.arxiv_id,
      };
    });

    const groundingJson = JSON.stringify({
      sources: sourceItems.map(({ id, title, snippet, arxiv_id }) => ({ id, title, snippet, arxiv_id })),
    });
    const finalPrompt = buildFinalPrompt(query, groundingJson);

    // 7) Stream answer (try Google Search grounding; fallback without tools)
    const streamResult = await timed('vertex_ai.generate_stream', reqId, async () => {
      const baseReq: any = {
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          responseMimeType: 'text/plain',
          maxOutputTokens: Math.min(1600, Number(process.env.CHAT_MAX_TOKENS || 1600)),
        },
      };
      try {
        return await generativeModel.generateContentStream({
          ...baseReq,
          tools: [{ googleSearch: {} }],
        });
      } catch (e: any) {
        const msg = e?.message || '';
        const isSchema400 = /Invalid JSON payload received|tool_config|googleSearch/i.test(msg);
        if (isSchema400) return await generativeModel.generateContentStream(baseReq);
        throw e;
      }
    });

    // 8) META channel (for GSAP / links / follow-ups chips)
    const meta = {
      format: 'markdown',
      links: sourceItems.map(s => ({ id: s.id, title: s.title, href: s.link })),
      followups: followupsFromKeywords((enhance as any).keywords || []),
      anim: { enter: 'stagger-fade' },
    };

    let emitted = 0;

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        // Emit SOURCES + META first so UI can render chips/cards immediately
        controller.enqueue(enc.encode(JSON.stringify(sourceItems) + '|||SOURCES|||'));
        controller.enqueue(enc.encode(JSON.stringify(meta) + '|||META|||'));

        try {
          for await (const item of (streamResult as any).stream) {
            const parts = item?.candidates?.[0]?.content?.parts;
            if (!Array.isArray(parts)) continue;
            for (const p of parts) {
              const chunk = p?.text;
              if (typeof chunk !== 'string' || !chunk) continue;

              const budget = STREAM_CHAR_CAP - emitted;
              if (budget <= 0) { controller.enqueue(enc.encode('\n\n[…truncated]')); controller.close(); return; }
              const slice = chunk.slice(0, budget);
              emitted += slice.length;
              controller.enqueue(enc.encode(slice));
              if (slice.length < chunk.length) { controller.enqueue(enc.encode('\n\n[…truncated]')); controller.close(); return; }
            }
          }
        } catch (e) {
          logError('Streaming iteration failed', reqId, e);
          controller.enqueue(enc.encode('\n\n[Stream ended due to an internal error]'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Request-Id': reqId,
        'X-Session-Id': session.sessionId,
        ...(assistantId ? { 'X-Turn-Id': assistantId } : {}),
        'X-Model': config.GENERATIVE_MODEL_NAME,
      },
    });
  } catch (error: any) {
    logError('[API CHAT GLOBAL ERROR]', reqId, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: 'The RAG pipeline failed.', details: errorMessage, reqId }, { status: 500 });
  }
}
