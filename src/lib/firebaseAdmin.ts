// src/lib/firebaseAdmin.ts
import { getApps, initializeApp, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Make TypeScript happy with global memoization
declare global {
  // eslint-disable-next-line no-var
  var __adminApp__: App | undefined;
  // eslint-disable-next-line no-var
  var __adminDb__: Firestore | undefined;
  // eslint-disable-next-line no-var
  var __firestoreSettingsApplied__: boolean | undefined;
}

const app =
  global.__adminApp__ ||
  (getApps().length === 0
    ? initializeApp({
        credential: applicationDefault(),
        projectId: process.env.GCP_PROJECT_ID || 'mindsieve-research-assistant',
      })
    : getApps()[0]);

global.__adminApp__ = app;

const db = global.__adminDb__ || getFirestore(app);

// Apply settings only once (before any use)
if (!global.__firestoreSettingsApplied__) {
  // Important: settings() must be called before any Firestore ops.
  db.settings({ ignoreUndefinedProperties: true });
  global.__firestoreSettingsApplied__ = true;
}

global.__adminDb__ = db;

export { db };
