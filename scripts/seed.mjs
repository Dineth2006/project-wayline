// Usage: npm run seed   (reads .env.local)
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});
const auth = getAuth(app);
const db = getDatabase(app);

async function upsertUser(email, password, displayName, claims) {
  let u;
  try { u = await auth.getUserByEmail(email); await auth.updateUser(u.uid, { password, displayName }); }
  catch { u = await auth.createUser({ email, password, displayName }); }
  await auth.setCustomUserClaims(u.uid, claims);
  await db.ref(`users/${u.uid}`).set({ email, name: displayName, ...claims, createdAt: Date.now() });
  return u;
}

const op = await upsertUser(process.env.SEED_OPERATOR_EMAIL, process.env.SEED_OPERATOR_PASSWORD, "Chief Operator", { role: "operator" });
console.log("operator:", op.email);

const buses = {
  bus_01: { name: "City Express 1", plate: "NB-1001", routeId: "loop_a", seats: 8, color: "#0e7a5b" },
  bus_02: { name: "City Express 2", plate: "NB-1002", routeId: "loop_a", seats: 8, color: "#b45309" },
};
for (const [id, meta] of Object.entries(buses)) {
  await db.ref(`buses/${id}/meta`).update(meta);
  const d = await upsertUser(`${id}@device.local`, process.env.DEVICE_PASSWORD, `${id} device`, { role: "device", busId: id });
  console.log("device:", d.email);
}

await db.ref("routes/loop_a").set({
  name: "Loop A",
  tolerance: 0.25,
  closed: true,
  points: [{ x: 0.3, y: 0.3 }, { x: 1.7, y: 0.3 }, { x: 1.7, y: 1.7 }, { x: 0.3, y: 1.7 }],
  stops: [
    { name: "Depot", x: 0.3, y: 0.3 },
    { name: "East Gate", x: 1.7, y: 0.3 },
    { name: "Market", x: 1.7, y: 1.7 },
    { name: "Campus", x: 0.3, y: 1.7 },
  ],
});
console.log("seeded routes and buses");
process.exit(0);
