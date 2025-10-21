// src/server/cards/generate.ts
import crypto from 'crypto';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { VertexAI } from '@google-cloud/vertexai';
import * as config from '@/config';

type SourceItem = { id: number; title: string; arxiv_id?: string };

export type GenerateParams = {
  sessionId: string;        // required: for querying + ownership
  turnId: string;           // required: link card to a specific assistant turn
  answer: string;           // full assistant response text
  sources: SourceItem[];
  topic?: string;
  fromQuery?: string;
  ownerUid?: string | null; // optional; ready for Identity Platform later
};

// -------- helpers --------
function normalizeLinks(v: any): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    try {
      const u = new URL(x.trim());
      out.push(u.toString());
    } catch {
      // ignore invalid URLs
    }
  }
  return out.slice(0, 4); // compact grid
}

function normalizeArr(v: any, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  const out = v
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());
  return out.slice(0, max);
}

const CARD_PROMPT = (topic: string, answer: string, sources: SourceItem[]) => `
You are distilling a concise study card from an explanation and its sources.

TOPIC: ${topic}

SOURCES (ID: title):
${sources.map((s) => `[${s.id}] ${s.title}`).join('\n')}

EXPLANATION:
${answer}

Return ONLY valid JSON with keys exactly:
{
  "topic": "...",
  "summary": "... (80-120 words, plain)",
  "bullets": ["...", "...", "..."],
  "keyTerms": ["...", "..."],
  "quiz": [{"q": "...", "a": "..."}],
  "tags": [],
  "links": []
}
`;

export async function generateAndStoreCard(params: GenerateParams) {
  const { sessionId, turnId, answer, sources, topic, fromQuery, ownerUid = null } = params;

  // ---- Stable, idempotent card id (session + turn + content + sources) ----
  const ids = sources.map((s) => s.id).sort((a, b) => a - b);
  const cardId = crypto
    .createHash('sha256')
    .update(`${sessionId}|${turnId}|${answer}|${JSON.stringify(ids)}`)
    .digest('hex')
    .slice(0, 28);

  const ref = db.collection('study_cards').doc(cardId);
  const snap = await ref.get();
  if (snap.exists) return { id: cardId, cached: true, card: snap.data() };

  // ---- Call Gemini (flash-lite default) ----
  const vertex = new VertexAI({ project: config.GCP_PROJECT_ID, location: config.GCP_REGION });
  const modelName = (config as any).CARD_MODEL_NAME || 'gemini-2.5-flash-lite';
  const model = vertex.getGenerativeModel({ model: modelName });

  const userTopic = topic || fromQuery || 'Study Topic';
  const prompt = CARD_PROMPT(userTopic, answer, sources);

  // NOTE: For Gemini 2.x on Vertex, grounding config is finicky across regions.
  // The safest toggle is tool-only (no toolConfig). Gate via env.
  const req: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  };
  if (process.env.CARD_USE_SEARCH_GROUNDING === '1') {
    req.tools = [{ googleSearch: {} }]; // no toolConfig to avoid 400s
  }

  let text = '{}';
  try {
    const res = await model.generateContent(req);
    text = res?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  } catch (e: any) {
    // If grounding/tool schema is rejected or any transient error, retry once without tools.
    const msg = e?.message || '';
    const schema400 = /Invalid JSON payload received|tool_config|googleSearchRetrieval|googleSearch/i.test(msg);
    if (schema400 && req.tools) {
      try {
        const retry = await model.generateContent({
          contents: req.contents,
          generationConfig: req.generationConfig,
        });
        text = retry?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      } catch (e2: any) {
        console.warn('[cards.generate] Gemini retry without tools failed:', e2?.message || e2);
      }
    } else {
      console.warn('[cards.generate] Gemini call failed:', msg);
    }
  }

  let payload: any = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }

  // ---- Build a compact, grid-friendly card ----
  const finalTopic = (payload.topic || userTopic).toString().slice(0, 120);
  const summary = (payload.summary || '').toString().slice(0, 1200);
  const bullets = normalizeArr(payload.bullets, 5);
  const keyTerms = normalizeArr(payload.keyTerms, 8);
  const quiz = Array.isArray(payload.quiz)
    ? payload.quiz
        .filter((q: any) => q && typeof q.q === 'string' && typeof q.a === 'string')
        .slice(0, 3)
        .map((q: any) => ({ q: q.q.trim(), a: q.a.trim() }))
    : [];
  const links = normalizeLinks(payload.links);
  const tags = normalizeArr(payload.tags, 8);

  const card = {
    id: cardId,
    sessionId,
    turnId,
    ownerUid, // null or uid (future IDP)
    topic: finalTopic,
    summary,
    bullets,
    keyTerms,
    quiz,
    links,
    sources: sources.map((s) => ({ id: s.id, title: s.title, arxiv_id: s.arxiv_id })),
    tags,
    fromQuery: fromQuery || '',
    createdAt: Date.now(),
  };

  // ---- Write card & touch turn atomically-ish ----
  const batch = db.batch();
  batch.set(ref, card, { merge: true });

  const turnRef = db.collection('turns').doc(turnId);
  batch.set(
    turnRef,
    {
      id: turnId,
      sessionId,
      ownerUid,
      preview: card.summary?.slice(0, 140) || card.bullets?.[0] || '',
      cardCount: FieldValue.increment(1),
      // avoid clobbering an existing createdAt
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  return { id: cardId, cached: false, card };
}
