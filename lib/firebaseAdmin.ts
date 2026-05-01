import * as admin from "firebase-admin";

const initializeFirebase = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  // 1. If Vercel wrapped it in quotes, strip them
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }

  // 2. Fix formatting: Replace literal '\n' strings with actual newlines
  // and handle cases where the key might be one giant line
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: formattedKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
};

const app = initializeFirebase();
export const db = admin.database(app);