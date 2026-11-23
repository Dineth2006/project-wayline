import { NextResponse } from "next/server";
import { adminAuth, adminDb, requireOperator } from "@/lib/firebaseAdmin";

/**
 * Operator-only: swap the driver assigned to a bus.
 * POST { uid: string (driver), busId: string }
 * - updates the driver's users/<uid> node + custom claims (busId)
 * - clears the previous driver on the target bus (node + claims)
 * - if the driver was on another bus, that bus becomes unassigned
 */
export async function POST(req: Request) {
  try {
    await requireOperator(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const { uid, busId } = await req.json();
  if (!uid || !busId) return NextResponse.json({ error: "Driver and bus are required." }, { status: 400 });

  const targetMeta = adminDb.ref(`buses/${busId}/meta`);
  if (!(await targetMeta.get()).exists()) return NextResponse.json({ error: `Unknown bus ${busId}.` }, { status: 400 });

  const driverRef = adminDb.ref(`users/${uid}`);
  const driver = (await driverRef.get()).val() as { role?: string; busId?: string } | null;
  if (!driver) return NextResponse.json({ error: "Unknown driver account." }, { status: 400 });
  if (driver.role !== "driver") return NextResponse.json({ error: "That account is not a driver." }, { status: 400 });

  try {
    // 1) the driver's previous bus (if any) becomes unassigned
    if (driver.busId && driver.busId !== busId) {
      const prev = (await adminDb.ref(`buses/${driver.busId}/meta`).get()).val() as { driverUid?: string } | null;
      if (prev?.driverUid === uid) await adminDb.ref(`buses/${driver.busId}/meta`).update({ driverUid: null, driverName: null });
    }

    // 2) the previous driver on the target bus loses the bus
    const current = (await targetMeta.child("driverUid").get()).val() as string | null;
    if (current && current !== uid) {
      await adminAuth.setCustomUserClaims(current, { role: "driver" });
      const curRef = adminDb.ref(`users/${current}`);
      if ((await curRef.get()).exists()) await curRef.update({ busId: null });
    }

    // 3) assign the bus to the driver
    await adminAuth.setCustomUserClaims(uid, { role: "driver", busId });
    const dVal = (await driverRef.get()).val() as Record<string, unknown> | null;
    if (dVal) {
      const { name } = dVal;
      await driverRef.update({ busId });
      await targetMeta.update({ driverUid: uid, driverName: name });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
