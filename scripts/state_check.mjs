// quick state check: list buses + telemetry age for each (device ID token)
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
const dbUrl = env.NEXT_PUBLIC_FIREBASE_DATABASE_URL.replace(/\/$/, "");

const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + env.NEXT_PUBLIC_FIREBASE_API_KEY, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "bus_01@device.local", password: env.DEVICE_PASSWORD, returnSecureToken: true }),
});
const j = await r.json();
if (!j.idToken) { console.log("device sign-in FAILED:", JSON.stringify(j).slice(0, 200)); process.exit(1); }
console.log("device sign-in OK");

const buses = await (await fetch(dbUrl + "/buses.json?auth=" + j.idToken)).json();
if (!buses) { console.log("NO buses at all in RTDB"); process.exit(0); }
for (const id of Object.keys(buses)) {
  const t = await (await fetch(dbUrl + `/buses/${id}/telemetry.json?auth=` + j.idToken)).json();
  const m = await (await fetch(dbUrl + `/buses/${id}/meta.json?auth=` + j.idToken)).json();
  if (t === null) {
    console.log(`${id}: NO telemetry node. meta=${JSON.stringify(m)}`);
  } else {
    const age = t.ts ? Math.round((Date.now() - Number(t.ts)) / 1000) : "?";
    console.log(`${id}: telemetry age=${age}s speed=${t.speed} connected=${t.connected} crash=${t.crash} force_stopped=${t.force_stopped}`);
    console.log(`   meta=${JSON.stringify(m)}`);
  }
}
// users too
const users = await (await fetch(dbUrl + "/users.json?auth=" + j.idToken)).json();
console.log("users node:", users ? Object.keys(users).join(", ") : "EMPTY (device can't read all users - expected)");
