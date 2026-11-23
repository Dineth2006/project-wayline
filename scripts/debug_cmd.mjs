// One-off debug: show commands/bus_01, alerts/bus_01_crash, and telemetry freshness.
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
const db = env.NEXT_PUBLIC_FIREBASE_DATABASE_URL.replace(/\/$/, "");
const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + env.NEXT_PUBLIC_FIREBASE_API_KEY, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "bus_01@device.local", password: env.DEVICE_PASSWORD, returnSecureToken: true }),
});
const j = await r.json();
if (!j.idToken) { console.log("device sign-in FAILED"); process.exit(1); }
const cmd = await (await fetch(db + "/commands/bus_01.json?auth=" + j.idToken)).json();
const alert = await (await fetch(db + "/alerts/bus_01_crash.json?auth=" + j.idToken)).json();
const tel = await (await fetch(db + "/buses/bus_01/telemetry.json?auth=" + j.idToken)).json();
console.log("commands/bus_01  =", JSON.stringify(cmd));
console.log("alerts/bus_01_crash =", JSON.stringify(alert));
console.log("telemetry.crash =", tel && tel.crash, " | ts age (s) =", tel ? Math.round((Date.now() - tel.ts) / 1000) : "n/a");
