// Firebase CLIENT SDK singleton (browser). Provides identity only — the token
// it produces is the sole credential the client holds, and is useless except
// against our permission-checking API (CLAUDE.md security boundary).
//
// This is CLIENT code: it reads NEXT_PUBLIC_ vars (public by design) and must
// NEVER import server-only modules (db, firebase-admin). Never verify tokens or
// touch Neon here.
"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// initializeApp throws if called twice; reuse across hot-reloads / re-renders.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
