// src/config.ts

/**
 * This file centralizes all application configuration.
 * It reads from environment variables and provides sensible defaults.
 * This is the single source of truth for configuration.
 */

// --- GCP Configuration ---
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "mindsieve-research-assistant";
export const GCP_REGION = process.env.GCP_REGION || "europe-west1";

// --- Model Configuration ---
export const EMBEDDING_MODEL_NAME = process.env.EMBEDDING_MODEL_NAME || "text-embedding-005";
export const GENERATIVE_MODEL_NAME = process.env.GENERATIVE_MODEL_NAME || "gemini-2.5-flash";

// --- Secret Manager Secret Names ---
// These are the *names* of the secrets, not their values.
export const ES_URL_SECRET_NAME = process.env.ES_URL_SECRET_NAME || "ELASTICSEARCH_URL";
export const ES_API_KEY_SECRET_NAME = process.env.ES_API_KEY_SECRET_NAME || "ELASTICSEARCH_API_KEY";

// --- Elasticsearch Configuration ---
export const ES_INDEX = process.env.ES_INDEX || "arxiv_cs_articles";
export const VECTOR_FIELD = "abstract_vector";

// --- RAG Pipeline Parameters ---
export const TOP_K = 10;
export const MAX_SNIPPETS = 8;
export const MAX_CHARS_PER_SNIPPET = 800;