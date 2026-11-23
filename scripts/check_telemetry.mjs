// one-off check: is bus_01 telemetry live in RTDB? reads twice, 3 s apart.
import * as admin from "firebase-admin";
import fs from "fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) {
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[line.slice(0, i).trim()] = v;
  }
}

const app = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});
const db = admin.database();

const snapshot = async (label) => {
  const s = await db.ref("bus_01/telemetry").once("value");
  if (!s.exists()) {
    console.log(`${label}: bus_01/telemetry does NOT exist (device has written nothing)`);
    return;
  }
  const v = s.val();
  const age = v.ts ? Math.round((Date.now() - Number(v.ts)) / 1000) : "?";
  console.log(`${label}:`, JSON.stringify(v), `| ts age: ${age}s`);
};

await snapshot("1st read ");
await new Promise((r) => setTimeout(r, 3000));
await snapshot("2nd read ");
process.exit(0);
