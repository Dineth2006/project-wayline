import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { adminDb, requireOperator } from "@/lib/firebaseAdmin";

/**
 * Operator-only maintenance endpoint: deploys the repo's database.rules.json
 * to the live Realtime Database (admin.database().setRules - the path that
 * actually accepts RTDB JSON rules).
 */
export async function POST(req: Request) {
  try {
    await requireOperator(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  try {
    const before = await adminDb.getRules();
    const file = path.join(process.cwd(), "database.rules.json");
    const src = fs.readFileSync(file, "utf8");
    await adminDb.setRules(src);
    const after = await adminDb.getRules();
    const changed = (after.includes('"connected"') && !before.includes('"connected"')) ? "connected rule added" : "rules updated";
    return NextResponse.json({ ok: true, bytes: src.length, note: changed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
