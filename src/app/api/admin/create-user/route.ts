import { NextResponse } from "next/server";
import { adminAuth, adminDb, requireOperator } from "@/lib/firebaseAdmin";

/** Operator-only: create operator or driver accounts. Drivers are linked to a bus. */
export async function POST(req: Request) {
  try { await requireOperator(req); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const { email, password, name, role, busId } = await req.json();
  if (!["operator", "driver"].includes(role) || !email || !name || typeof password !== "string" || password.length < 6)
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  if (role === "driver") {
    if (!busId) return NextResponse.json({ error: "Choose a bus for the driver." }, { status: 400 });
    if (!(await adminDb.ref(`buses/${busId}/meta`).get()).exists())
      return NextResponse.json({ error: `Unknown bus ${busId}.` }, { status: 400 });
  }
  try {
    const u = await adminAuth.createUser({ email, password, displayName: name });
    const claims = role === "driver" ? { role, busId } : { role };
    await adminAuth.setCustomUserClaims(u.uid, claims);
    await adminDb.ref(`users/${u.uid}`).set({ email, name, ...claims, createdAt: Date.now() });
    if (role === "driver") {
      const metaRef = adminDb.ref(`buses/${busId}/meta`);
      const old = (await metaRef.child("driverUid").get()).val();
      if (old) await adminAuth.setCustomUserClaims(old, { role: "driver" }); // previous driver loses the bus
      await metaRef.update({ driverUid: u.uid, driverName: name });
    }
    return NextResponse.json({ ok: true, uid: u.uid });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
