import * as admin from "firebase-admin";

const initializeFirebase = () => {
  // If already initialized, use the existing app
  if (admin.apps.length > 0) return admin.app();

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Safety check: if the key is missing during build, don't crash
  if (!privateKey) {
    console.warn("Firebase key missing; skipping initialization during build.");
    return null;
  }

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
// Only export the DB if the app was successfully created
export const db = app ? admin.database(app) : null;