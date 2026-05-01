import * as admin from "firebase-admin";

if (!admin.apps.length) {
  const rawKey = process.env.FIREBASE_PRIVATE_KEY || "";
  // High-speed formatting: fix newlines and remove any accidental quotes
  const formattedKey = rawKey.replace(/"/g, '').replace(/\\n/g, '\n').trim();

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: formattedKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

export const db = admin.database();