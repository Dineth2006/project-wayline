/**
 * sync_user_claims.mjs — keep RTDB `users/<uid>` (role, busId) in sync with
 * each Firebase Auth user's custom claims (the authoritative source the
 * security rules and login redirect use).
 *
 * Run:  node --env-file=.env.local scripts/sync_user_claims.mjs
 *
 * Fixes the "driver logs in but sees 'No bus'" case, where the claim has a
 * busId but the RTDB node doesn't. Idempotent — safe to re-run.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});
const db = getDatabase(app);
const auth = getAuth(app);

// Sync every human user's RTDB node (role + busId) from their custom claims,
// which are the authoritative source the security rules and login redirect use.
let page;
const all = [];
do { const r = await auth.listUsers(100, page); all.push(...r.users); page = r.nextPageToken; } while (page);

for (const u of all) {
  const claims = u.customClaims ?? {};
  if (!claims.role) continue; // skip accounts without a role
  const cur = await db.ref("users/" + u.uid).get();
  const data = cur.val() ?? {};
  const role = data.role ?? claims.role;
  const busId = claims.busId !== undefined ? claims.busId : data.busId;
  const patch = {};
  patch.role = role;
  if (busId) patch.busId = busId;
  else if (data.busId) patch.busId = null; // clear stale
  const changed = data.role !== role || (busId ? data.busId !== busId : !!data.busId);
  if (changed) {
    await db.ref("users/" + u.uid).update(patch);
    console.log(`updated ${u.email ?? u.uid.slice(0,8)}:`, JSON.stringify(patch));
  } else {
    console.log(`ok      ${u.email ?? u.uid.slice(0,8)} (no change)`);
  }
}
process.exit(0);
