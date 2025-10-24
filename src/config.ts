// src/config.ts

/**
 * Centralized application configuration.
 * Auto-detects Cloud Run vs. local dev and chooses safe defaults.
 */

// -----------------------------
// Env / runtime detection
// -----------------------------
const IS_CLOUD_RUN = !!process.env.K_SERVICE;              // present on Cloud Run
const IS_VERCEL = !!process.env.VERCEL;                   // just in case
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DEV = NODE_ENV !== 'production' && !IS_CLOUD_RUN;

// Optional kill switch: force sync even on Cloud Run (useful for debugging)
export const FORCE_SYNC = process.env.FORCE_SYNC === '1';

// -----------------------------
// GCP / Region
// -----------------------------
export const GCP_PROJECT_ID =
  process.env.GCP_PROJECT_ID || 'mindsieve-research-assistant';

export const GCP_REGION =
  process.env.GCP_REGION || 'europe-west1';

// -----------------------------
// Model configuration
// -----------------------------
export const EMBEDDING_MODEL_NAME =
  process.env.EMBEDDING_MODEL_NAME || 'text-embedding-005';

export const GENERATIVE_MODEL_NAME =
  process.env.GENERATIVE_MODEL_NAME || 'gemini-2.5-flash';

// Distiller model for study cards (fast)
export const CARD_MODEL_NAME =
  process.env.CARD_MODEL_NAME || 'gemini-2.5-flash';

// -----------------------------
// Secret Manager (names, not values)
// -----------------------------
export const ES_URL_SECRET_NAME =
  process.env.ES_URL_SECRET_NAME || 'ELASTICSEARCH_URL';

export const ES_API_KEY_SECRET_NAME =
  process.env.ES_API_KEY_SECRET_NAME || 'ELASTICSEARCH_API_KEY';

// -----------------------------
// Elasticsearch
// -----------------------------
export const ES_INDEX = process.env.ES_INDEX || 'arxiv_cs_articles';
export const VECTOR_FIELD = 'abstract_vector';

// -----------------------------
// RAG pipeline params
// -----------------------------
export const TOP_K = 10;
export const MAX_SNIPPETS = 8;
export const MAX_CHARS_PER_SNIPPET = 800;

// -----------------------------
// Cloud Tasks (async card generation)
// -----------------------------
export const TASKS_LOCATION =
  process.env.TASKS_LOCATION || GCP_REGION; // usually same region

export const TASKS_QUEUE =
  process.env.TASKS_QUEUE || 'study-cards-queue';

// Handler URL:
// - Local dev: default to localhost Next.js API route
// - Cloud Run: require env or set it in your deploy (best practice)
//   (Cloud Run doesn't expose host via env, so we can't infer it reliably.)
export const TASKS_HANDLER_URL =
  process.env.TASKS_HANDLER_URL ||
  (IS_CLOUD_RUN
    ? '' // <-- set this via env in Cloud Run (e.g. https://<service>.a.run.app/api/tasks/cards)
    : 'http://localhost:3000/api/tasks/cards');

// If you’re using OIDC-signed tasks in prod, set this to your enqueuer SA email.
export const TASKS_SA_EMAIL = process.env.TASKS_SA_EMAIL || '';

// Single flag the app can use to decide enqueue vs. inline execution
export const USE_ASYNC_TASKS = IS_CLOUD_RUN && !FORCE_SYNC;

// Useful for logs/diagnostics
export const RUNTIME_FLAGS = {
  IS_CLOUD_RUN,
  IS_VERCEL,
  IS_DEV,
  NODE_ENV,
  USE_ASYNC_TASKS,
};
// -----------------------------