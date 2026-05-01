import * as admin from "firebase-admin";

if (!admin.apps.length) {
  // Get the key and immediately trim any hidden spaces
  let privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();

  // 1. Remove accidental wrapping quotes if they exist
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }

  // 2. Fix the newline characters
  // This handles both escaped \\n and actual \n
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
    console.error("Firebase Admin init error:", error);
  }
}

export const db = admin.database();