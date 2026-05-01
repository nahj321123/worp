import admin from "firebase-admin"

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string
  )

  // 🔥 FIX: restore line breaks in private key
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n")

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  })
}

export const db = admin.database()