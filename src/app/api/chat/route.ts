// src/app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { VertexAI, TextEmbeddingModel } from '@google-cloud/vertexai';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { GoogleAuth } from 'google-auth-library';
import * as config from '@/config';

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * Logging utils
 * ────────────────────────────────────────────────────────────────────────────────
 */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const ts = () => new Date().toISOString();

function logStart(step: string, reqId: string, extra: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ ts: ts(), level: 'INFO', reqId, event: 'STEP_START', step, ...extra }));
}
function logEnd(step: string, reqId: string, ms: number, extra: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ ts: ts(), level: 'INFO', reqId, event: 'STEP_END', step, duration_ms: ms, ...extra }));
}
function logInfo(msg: string, reqId: string, extra: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ ts: ts(), level: 'INFO', reqId, msg, ...extra }));
}
function logWarn(msg: string, reqId: string, extra: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ ts: ts(), level: 'WARN', reqId, msg, ...extra }));
}
function logError(msg: string, reqId: string, error?: unknown, extra: Record<string, unknown> = {}) {
  const safeErr = serializeError(error);
  console.error(JSON.stringify({ ts: ts(), level: 'ERROR', reqId, msg, error: safeErr, ...extra }));
}
function serializeError(e: unknown) {
  if (!e) return null;
  if (e instanceof Error) {
    const anyErr = e as any;
    return {
      name: e.name,
      message: e.message,
      stack: e.stack,
      code: anyErr.code,
      status: anyErr.status,
      details: anyErr.details,
      reason: anyErr.reason,
    };
  }
  return e;
}
async function timed<T>(step: string, reqId: string, fn: () => Promise<T>): Promise<T> {
  const t0 = now();
  logStart(step, reqId);
  try {
    const out = await fn();
    logEnd(step, reqId, now() - t0);
    return out;
  } catch (err) {
    logError(`Step failed: ${step}`, reqId, err);
    throw err;
  }
}

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * Clients (singleton)
 * ────────────────────────────────────────────────────────────────────────────────
 */
let clients:
  | {
      vertexAI: VertexAI;
      esClient: ElasticsearchClient;
    }
  | null = null;

async function getSecrets(reqId: string): Promise<{ esUrl: string; esApiKey: string }> {
  return timed('secret_manager.access', reqId, async () => {
    try {
      const secretManager = new SecretManagerServiceClient();
      const getSecretValue = async (secretName: string) => {
        const [version] = await secretManager.accessSecretVersion({
          name: `projects/${config.GCP_PROJECT_ID}/secrets/${secretName}/versions/latest`,
        });
        const payload = version.payload?.data?.toString();
        if (!payload) throw new Error(`Secret ${secretName} has no payload or data.`);
        return payload;
      };
      const [esUrl, esApiKey] = await Promise.all([
        getSecretValue(config.ES_URL_SECRET_NAME),
        getSecretValue(config.ES_API_KEY_SECRET_NAME),
      ]);
      return { esUrl, esApiKey };
    } catch (error) {
      logError('Failed to retrieve secrets', reqId, error, {
        projectId: config.GCP_PROJECT_ID,
        secretNames: [config.ES_URL_SECRET_NAME, config.ES_API_KEY_SECRET_NAME],
      });
      throw new Error('Could not retrieve secrets from Secret Manager. Check IAM permissions and secret names.');
    }
  });
}

async function initializeClients(reqId: string) {
  if (clients) {
    logInfo('Reusing initialized clients', reqId);
    return clients;
  }
  logInfo('Initializing clients...', reqId, {
    projectId: config.GCP_PROJECT_ID,
    region: config.GCP_REGION,
  });

  const { esUrl, esApiKey } = await getSecrets(reqId);

  const vertexAI = await timed('vertex_ai.init', reqId, async () => {
    // Uses ADC
    return new VertexAI({
      project: config.GCP_PROJECT_ID,
      location: config.GCP_REGION,
    });
  });

  const esClient = await timed('elasticsearch.init', reqId, async () => {
    const client = new ElasticsearchClient({ node: esUrl, auth: { apiKey: esApiKey } });
    try {
      await client.ping();
      logInfo('Elasticsearch ping ok', reqId, { node: esUrl });
    } catch (e) {
      logError('Elasticsearch ping failed', reqId, e, { node: esUrl });
      throw new Error('Connection to Elasticsearch failed. Check URL and API Key.');
    }
    return client;
  });

  clients = { vertexAI, esClient };
  logInfo('Clients initialized.', reqId);
  return clients;
}

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * RAG helpers
 * ────────────────────────────────────────────────────────────────────────────────
 */
const QUERY_ENHANCER_PROMPT = `You are an expert research assistant AI. Your goal is to take a user's brief query and transform it into a highly effective search query for a semantic search system that indexes academic papers.
**Instructions:**
1.  **Generate a Hypothetical Answer:** Write a detailed, one-paragraph hypothetical answer to the user's query. Assume you are an expert on the topic. This rich text will be used as the primary vector for the semantic search.
2.  **Extract Keywords:** Identify the most important technical keywords and concepts from the query and the hypothetical answer.
**User Query:**
{query}
**Output Format:**
Respond with a single, valid JSON object with the keys: "hypothetical_answer" and "keywords".`;

async function strengthenQuery(query: string, generativeModel: any, reqId: string): Promise<string> {
  return timed('vertex_ai.enhance_query', reqId, async () => {
    const prompt = QUERY_ENHANCER_PROMPT.replace('{query}', query);
    try {
      const result = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });

      const responseText = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        logWarn('No enhancement text returned; falling back to original query', reqId);
        return query;
      }
      try {
        const parsed = JSON.parse(responseText);
        const hypo = parsed?.hypothetical_answer;
        if (typeof hypo === 'string' && hypo.trim().length > 0) {
          return hypo;
        }
        logWarn('Enhancer JSON missing hypothetical_answer; using original query', reqId, { parsed });
        return query;
      } catch (jsonErr) {
        logWarn('Enhancer returned non-JSON or invalid JSON; using original query', reqId, {
          responseText,
          jsonErr: serializeError(jsonErr),
        });
        return query;
      }
    } catch (error) {
      logWarn('AI query expansion failed; using original query', reqId, { error: serializeError(error) });
      return query;
    }
  });
}

/**
 * Embeddings model getter that **always** returns something callable:
 * 1) vertexAI.preview.getTextEmbeddingModel (if available in 1.10.0)
 * 2) new TextEmbeddingModel({ project, location, model })
 * 3) REST fallback using ADC (returns compatible shape)
 */
async function getEmbeddingModel(vertexAI: VertexAI, reqId: string) {
  // 1) Preview getter (present in 1.10.x)
  const previewGetter = (vertexAI as any)?.preview?.getTextEmbeddingModel;
  if (typeof previewGetter === 'function') {
    const m = previewGetter.call((vertexAI as any).preview, config.EMBEDDING_MODEL_NAME);
    if (m && typeof (m as any).embedContent === 'function') {
      logInfo('Using preview.getTextEmbeddingModel()', reqId);
      return m;
    }
  }

  // 2) Direct class
  try {
    const m = new TextEmbeddingModel({
      project: config.GCP_PROJECT_ID,
      location: config.GCP_REGION,
      model: config.EMBEDDING_MODEL_NAME, // e.g. 'text-embedding-005' or 'gemini-embedding-001'
    });
    if (typeof (m as any).embedContent === 'function') {
      logInfo('Using TextEmbeddingModel class', reqId);
      return m;
    }
  } catch (e) {
    logWarn('Failed to construct TextEmbeddingModel class; will REST-fallback', reqId, { err: serializeError(e) });
  }

  // 3) REST fallback wrapper (mimics SDK signature)
  logWarn('Falling back to REST embeddings', reqId);
  return {
    async embedContent({ content }: { content: { role: string; parts: { text: string }[] } }) {
      const text = content?.parts?.[0]?.text ?? '';
      return await embedViaRest(text, reqId); // returns { embedding: { values: number[] } }
    },
    __restFallback: true,
  };
}

async function embedViaRest(text: string, reqId: string) {
  return timed('vertex_ai.embed_rest', reqId, async () => {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const token = await auth.getAccessToken();
    const url = `https://${config.GCP_REGION}-aiplatform.googleapis.com/v1/projects/${config.GCP_PROJECT_ID}/locations/${config.GCP_REGION}/publishers/google/models/${config.EMBEDDING_MODEL_NAME}:predict`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ content: text }], parameters: { autoTruncate: true } }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Embeddings REST error ${resp.status}: ${body}`);
    }

    const json: any = await resp.json();
    const values =
      json?.predictions?.[0]?.embedding?.values ??
      json?.predictions?.[0]?.embeddings?.values;

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Embeddings REST returned no vector.');
    }

    // Match SDK-ish shape so downstream stays identical
    return { embedding: { values } };
  });
}

async function getEmbedding(text: string, embeddingModel: any, reqId: string): Promise<number[]> {
  return timed('vertex_ai.embed', reqId, async () => {
    try {
      const res = await embeddingModel.embedContent({
        content: { role: 'user', parts: [{ text }] },
      });

      // Handle both SDK + REST shapes
      const values =
        (res as any)?.embedding?.values ??
        (res as any)?.embeddings?.[0]?.values ??
        (Array.isArray(res) ? res : null);

      if (Array.isArray(values) && values.length > 0) return values as number[];
      throw new Error('Vertex returned no embedding vector.');
    } catch (error) {
      logError('Vertex AI embedding API failed', reqId, error, {
        embeddingModel: config.EMBEDDING_MODEL_NAME,
        region: config.GCP_REGION,
      });
      throw new Error('Failed to generate text embedding from Vertex AI. Check API enablement and permissions.');
    }
  });
}

function buildFinalPrompt(query: string, groundingJson: string): string {
  return `You are an expert Computer Science tutor. Your task is to answer the user's QUESTION based on the provided SOURCES JSON, which contains snippets from relevant arXiv papers.
**Instructions:**
1.  Synthesize the information from the source snippets to construct a comprehensive and clear answer.
2.  When you use information from a source, you **must** cite it using its ID, like \`[1]\`, \`[2]\`, etc.
3.  Structure your answer with a direct summary first, followed by a more detailed explanation.
4.  If the provided sources are insufficient, you may use your general knowledge but you **must** explicitly label it as 'General Knowledge:'.
5.  Do not mention the snippets or the JSON object directly. Just use the information and cite it.
SOURCES:
${groundingJson}
QUESTION:
${query}`;
}

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * HTTP handler (POST)
 * ────────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  const reqId =
    (globalThis.crypto && 'randomUUID' in globalThis.crypto)
      ? (globalThis.crypto as any).randomUUID()
      : Math.random().toString(36).slice(2);

  logInfo('Incoming request', reqId, {
    region: config.GCP_REGION,
    projectId: config.GCP_PROJECT_ID,
    generativeModel: config.GENERATIVE_MODEL_NAME,
    embeddingModel: config.EMBEDDING_MODEL_NAME,
    index: config.ES_INDEX,
  });

  try {
    // Parse body
    const { query } = await timed('request.parse_body', reqId, async () => {
      const b = await req.json();
      return b;
    });

    if (!query || typeof query !== 'string') {
      logWarn('Invalid query payload', reqId, { queryType: typeof query });
      return NextResponse.json({ error: 'Query is required and must be a string.' }, { status: 400 });
    }

    // 1) Initialize clients
    const { vertexAI, esClient } = await initializeClients(reqId);

    // 2) Model objects (cheap)
    const generativeModel = await timed('vertex_ai.get_generative_model', reqId, async () => {
      return vertexAI.getGenerativeModel({ model: config.GENERATIVE_MODEL_NAME });
    });

    const embeddingModel = await timed('vertex_ai.get_embedding_model', reqId, async () => {
      return getEmbeddingModel(vertexAI, reqId);
    });

    // 3) Strengthen query
    const enhancedQuery = await strengthenQuery(query, generativeModel, reqId);

    // 4) Generate embedding
    const queryVector = await getEmbedding(enhancedQuery, embeddingModel, reqId);

    // 5) Hybrid search
    const searchResponse = await timed('elasticsearch.search', reqId, async () => {
      return esClient.search({
        index: config.ES_INDEX,
        size: config.TOP_K,
        _source: ['title', 'abstract', 'summary', 'published', 'authors', 'article_url', 'arxiv_id'],
        query: { multi_match: { query: enhancedQuery, fields: ['title^3', 'abstract', 'summary'], fuzziness: 'AUTO' } },
        knn: { field: config.VECTOR_FIELD, query_vector: queryVector, k: config.TOP_K, num_candidates: 50 },
        rank: { rrf: { rank_window_size: 100, rank_constant: 20 } },
        highlight: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fields: { abstract: {}, summary: {} } },
      });
    });

    const hits: any[] = (searchResponse as any)?.hits?.hits ?? [];
    logInfo('Search results', reqId, { totalHits: hits.length });

    if (hits.length === 0) {
      const answer =
        "I couldn't find any specific documents in my arXiv knowledge base for your query. Please try rephrasing.";
      const sourcesJson = JSON.stringify([]);
      return new Response(sourcesJson + '|||SOURCES|||' + answer, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Request-Id': reqId },
      });
    }

    // 6) Format sources & prompt
    const topDocs = hits.slice(0, config.MAX_SNIPPETS);
    const sourceItems = topDocs.map((hit: any, i: number) => {
      const source = hit._source;
      const highlight = hit.highlight?.abstract?.[0] || hit.highlight?.summary?.[0];
      const raw = source.abstract || source.summary || '';
      const snippetRaw = highlight || raw.substring(0, config.MAX_CHARS_PER_SNIPPET);
      const snippet = (snippetRaw || '').replace(/<mark>/g, '**').replace(/<\/mark>/g, '**') + '...';
      return {
        id: i + 1,
        title: source.title,
        link: source.article_url,
        published: source.published?.split('T')[0],
        snippet,
        arxiv_id: source.arxiv_id,
      };
    });

    const groundingJson = JSON.stringify({
      sources: sourceItems.map(({ id, title, snippet, arxiv_id }) => ({ id, title, snippet, arxiv_id })),
    });
    const finalPrompt = buildFinalPrompt(query, groundingJson);

    // 7) Stream from Vertex (proper envelope)
    const streamResult = await timed('vertex_ai.generate_stream', reqId, async () => {
      return generativeModel.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
        // generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      });
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sourcesJson = JSON.stringify(sourceItems);
        controller.enqueue(encoder.encode(sourcesJson + '|||SOURCES|||'));

        try {
          for await (const item of (streamResult as any).stream) {
            const parts = item?.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
              for (const p of parts) {
                const chunk = p?.text;
                if (typeof chunk === 'string' && chunk.length > 0) {
                  controller.enqueue(encoder.encode(chunk));
                }
              }
            }
          }
        } catch (e) {
          logError('Streaming iteration failed', reqId, e);
          controller.enqueue(encoder.encode('\n\n[Stream ended due to an internal error]'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Request-Id': reqId },
    });
  } catch (error: any) {
    logError('[API CHAT GLOBAL ERROR]', reqId, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json(
      { error: 'The RAG pipeline failed.', details: errorMessage, reqId },
      { status: 500 }
    );
  }
}
