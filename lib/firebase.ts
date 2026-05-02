import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "surepark-c045a.firebaseapp.com",
  databaseURL: "https://surepark-c045a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "surepark-c045a",
  storageBucket: "surepark-c045a.appspot.com",
  messagingSenderId: "YOUR_ID",
  appId: "YOUR_APP_ID",
};

// Initialize Firebase (only once)
const app = initializeApp(firebaseConfig);

// ✅ THIS IS WHAT YOUR ERROR NEEDS
export const db = getDatabase(app);