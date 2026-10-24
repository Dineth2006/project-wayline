import { NextResponse } from "next/server";
import { adminDb, requireOperator } from "@/lib/firebaseAdmin";

/**
 * Operator-only: remove a bus and everything attached to it
 * (meta, telemetry, events, commands, seat data, ratings).
 * Also clears the busId on the driver profile that was linked to it.
 */
export async function POST(req: Request) {
  try { await requireOperator(req); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const { busId } = await req.json();
  if (!busId || typeof busId !== "string") {
    return NextResponse.json({ error: "Missing busId." }, { status: 400 });
  }

  try {
    const metaRef = adminDb.ref(`buses/${busId}/meta`);
    const driverUid = (await metaRef.child("driverUid").get()).val();

    // wipe everything under the bus
    const promises = [
      adminDb.ref(`buses/${busId}`).remove(),
      adminDb.ref(`events/${busId}`).remove(),
      adminDb.ref(`commands/${busId}`).remove(),
      adminDb.ref(`seats/${busId}`).remove(),
      adminDb.ref(`ratings/${busId}`).remove(),
    ];
    if (driverUid) promises.push(adminDb.ref(`users/${driverUid}/busId`).set(null));
    await Promise.all(promises);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
