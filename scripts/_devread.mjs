
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

// 1) device sign-in -> ID token (same flow the ESP32 uses)
const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + env.NEXT_PUBLIC_FIREBASE_API_KEY, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "bus_01@device.local", password: env.DEVICE_PASSWORD, returnSecureToken: true }),
});
const j = await r.json();
if (!j.idToken) { console.log("device sign-in FAILED:", JSON.stringify(j).slice(0, 200)); process.exit(1); }
console.log("device sign-in OK");

// 2) read with the ID token
const read = async (label) => {
  const q = await fetch(dbUrl + "/buses/bus_01/telemetry.json?auth=" + j.idToken);
  const v = await q.json();
  if (v === null) { console.log(label + ": telemetry node does NOT exist — device has written nothing"); return; }
  const age = v.ts ? Math.round((Date.now() - Number(v.ts)) / 1000) : "?";
  console.log(label + ": " + JSON.stringify(v) + "  | ts age: " + age + "s");
};
await read("1st read");
await new Promise((x) => setTimeout(x, 3000));
await read("2nd read");
