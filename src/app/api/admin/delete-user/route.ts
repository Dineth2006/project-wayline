import { NextResponse } from "next/server";
import { adminAuth, adminDb, requireOperator } from "@/lib/firebaseAdmin";

/**
 * Operator-only: remove a driver or operator account.
 * Deletes the Firebase Auth user, their users/ profile, and unlinks the
 * bus if the removed account was a driver. Passengers cannot be removed
 * from here (they self-serve; they aren't shown to operators).
 */
export async function POST(req: Request) {
  let actor: { uid: string };
  try { actor = await requireOperator(req); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const { uid, busId } = await req.json();
  if (!uid) return NextResponse.json({ error: "Missing uid." }, { status: 400 });

  // refuse to remove yourself
  if (actor.uid === uid) return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });

  try {
    const snap = await adminDb.ref(`users/${uid}`).get();
    if (!snap.exists()) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    const profile = snap.val() as { role?: string; busId?: string };
    if (profile.role === "passenger") return NextResponse.json({ error: "Passenger accounts cannot be removed from here." }, { status: 400 });

    // unlink bus if the removed account was its driver
    const bus = busId ?? profile.busId;
    if (profile.role === "driver" && bus) {
      const metaRef = adminDb.ref(`buses/${bus}/meta`);
      const old = (await metaRef.child("driverUid").get()).val();
      if (old === uid) await metaRef.update({ driverUid: null, driverName: null });
    }

    await adminAuth.deleteUser(uid);
    await adminDb.ref(`users/${uid}`).remove();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
