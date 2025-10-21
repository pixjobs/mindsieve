// src/lib/env.ts
export const IS_CLOUD_RUN = !!process.env.K_SERVICE;     // set by Cloud Run
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID!;
export const GCP_REGION = process.env.GCP_REGION || 'europe-west1';

// Optional: kill-switch for async even on Cloud Run (e.g. debugging)
export const FORCE_SYNC = process.env.FORCE_SYNC === '1';
