import * as admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!rawKey) {
      throw new Error("FIREBASE_PRIVATE_KEY is missing from Env Variables");
    }

    // This regex fix handles every common Vercel formatting error
    const formattedKey = rawKey
      .replace(/\\n/g, '\n')     // Convert literal \n to actual newlines
      .replace(/^"(.*)"$/, '$1'); // Remove wrapping quotes if they exist

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedKey,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
    
    console.log("Firebase Admin: Successfully Connected");
  } catch (error: any) {
    console.error("Firebase Initialization Error:", error.message);
  }
}

export const db = admin.database();