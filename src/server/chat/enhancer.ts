// src/server/chat/enhancer.ts
import type { GenerativeModel } from '@google-cloud/vertexai';

export type EnhanceResult =
  | { blocked: true; reason: string }
  | { blocked?: false; hypothetical: string; keywords: string[] };

export const QUERY_ENHANCER_PROMPT = `
You are a guarded research assistant. Your job is to either:
A) Transform the user's brief query into a compact "hypothetical_answer" and a "keywords" array for semantic search, OR
B) If the query is unsafe or clearly spam/meaningless, return a blocked JSON.

Safety/Quality checklist (block if ANY apply):
- Illegal instructions (weapons/explosives, break-ins, bypass/DRM).
- Malware or exploit creation/usage; operational attack advice.
- Hate/harassment; sexual content involving minors; explicit sexual content.
- Self-harm encouragement; medical/mental-health advice beyond general info.
- Sensitive PII collection/doxxing.
- Graphic violence or instructions to cause harm.
- Empty/nonsense/spam/noise.
- Clearly unrelated to academic/technical search utility.

Output rules:
- Output ONLY valid JSON (no markdown, no commentary).
- If blocked, return: { "blocked": true, "reason": "<short reason>" } and nothing else.
- If allowed, return ONLY:
  {
    "hypothetical_answer": "string (<= 700 chars, compact, factual, self-contained; no citations)",
    "keywords": ["string", ... 3-10 items; short tokens; no extra punctuation beyond hyphens/slashes]
  }

User Query:
{query}
`.trim();

/** quick, cheap server-side guard (reject obvious abuse before calling model) */
const UNSAFE_PATTERNS: RegExp[] = [
  /\b(build|make|buy|sell)\s+(a|an)?\s*(bomb|explosive|grenade|gun|firearm|pipe\s*bomb)\b/i,
  /\b(exploit|zero[-\s]?day|rce|priv[-\s]?esc|backdoor|keylogger|ransomware|malware)\b/i,
  /\b(ddos|sql\s*injection|xss|csrf|credential\s*stuffing|bruteforce)\b/i,
  /\b(paywall|bypass|crack|torrent|warez|license\s*key|activation\s*key)\b/i,
  /\b(self[-\s]?harm|suicide|kill\s*myself|how\s*to\s*die)\b/i,
  /\b(ssn|social\s*security\s*number|credit\s*card|cvv|dob|home\s*address)\b/i,
  /\b(child|minor).*(sexual|porn|explicit)/i,
];

export function preflightUnsafe(query: string): string | null {
  if (!query || !query.trim()) return 'Empty or meaningless query';
  for (const r of UNSAFE_PATTERNS) if (r.test(query)) return `Disallowed content: ${r.source}`;
  return null;
}

/**
 * enhanceQuery
 * - Runs preflight; if unsafe -> { blocked: true }
 * - Otherwise asks the model for guarded JSON
 * - On model error, returns a permissive fallback (use raw query)
 */
export async function enhanceQuery(
  query: string,
  model: Pick<GenerativeModel, 'generateContent'>
): Promise<EnhanceResult> {
  const unsafeReason = preflightUnsafe(query);
  if (unsafeReason) return { blocked: true, reason: unsafeReason };

  try {
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: QUERY_ENHANCER_PROMPT.replace('{query}', query) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const txt = res?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(txt);

    if (parsed?.blocked === true) {
      return { blocked: true, reason: String(parsed?.reason || 'blocked') };
    }

    const hypo = typeof parsed?.hypothetical_answer === 'string' ? parsed.hypothetical_answer.trim() : '';
    const kws = Array.isArray(parsed?.keywords) ? parsed.keywords : [];

    if (!hypo) return { hypothetical: query, keywords: [] };
    return { hypothetical: hypo, keywords: kws };
  } catch {
    // fail-closed on safety (preflight), fail-open on availability (fallback to raw)
    return { hypothetical: query, keywords: [] };
  }
}
