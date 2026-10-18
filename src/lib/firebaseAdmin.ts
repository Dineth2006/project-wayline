import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });

export const adminAuth = getAuth(app);
export const adminDb = getDatabase(app);

/** Verifies the Bearer ID token and requires role=operator. Throws otherwise. */
export async function requireOperator(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) throw new Error("Missing token");
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.role !== "operator") throw new Error("Operators only");
  return decoded;
}
