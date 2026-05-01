import * as admin from "firebase-admin";

const initializeFirebase = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const base64Key = process.env.FIREBASE_PRIVATE_KEY || "";
  if (!base64Key) {
    throw new Error("FIREBASE_PRIVATE_KEY is missing from environment variables");
  }

  // Decode the Base64 key we created in the last step
  const privateKey = Buffer.from(base64Key, 'base64').toString('ascii');

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
};

// Initialize the app immediately
const app = initializeFirebase();

// Export the database using that specific initialized app
export const db = admin.database(app);