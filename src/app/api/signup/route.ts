import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

/** Public passenger sign-up. The role is always "passenger", set server-side. */
export async function POST(req: Request) {
  const { email, password, name } = await req.json();
  if (!email || !name || typeof password !== "string" || password.length < 6)
    return NextResponse.json({ error: "Name, email and a password of 6+ characters are required." }, { status: 400 });
  try {
    const u = await adminAuth.createUser({ email, password, displayName: name });
    await adminAuth.setCustomUserClaims(u.uid, { role: "passenger" });
    await adminDb.ref(`users/${u.uid}`).set({ email, name, role: "passenger", createdAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
