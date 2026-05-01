import * as admin from "firebase-admin";

if (!admin.apps.length) {
  // 1. Get the key and trim any accidental spaces
  let privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();

  // 2. Remove accidental double-quotes if Vercel added them
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }

  // 3. Fix the newline characters so Firebase can read the PEM format
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedKey,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  } catch (error) {
    console.error("Firebase Admin Error:", error);
  }
}

export const db = admin.database();