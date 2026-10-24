import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  type UserCredential,
} from "firebase/auth";
import { getDatabase } from "firebase/database";

const app = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });

export const auth = getAuth(app);
export const db = getDatabase(app);

/** Current user's Firebase ID token (for /api/* calls that need it). */
export async function authToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("You must be signed in.");
  return u.getIdToken();
}

export const login = (email: string, password: string): Promise<UserCredential> =>
  signInWithEmailAndPassword(auth, email, password);
