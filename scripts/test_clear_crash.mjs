// One-off test: fire clearCrash=true and watch whether the physical device
// clears telemetry.crash — and whether it re-triggers within seconds.
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
const sign = async (email, pw) => {
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + env.NEXT_PUBLIC_FIREBASE_API_KEY, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error("sign-in failed for " + email);
  return j.idToken;
};
const op = await sign(env.SEED_OPERATOR_EMAIL, env.SEED_OPERATOR_PASSWORD);
const read = async (tok) => (await (await fetch(db + "/buses/bus_01/telemetry.json?auth=" + tok)).json());
const dev = await sign("bus_01@device.local", env.DEVICE_PASSWORD);

console.log("before: crash =", (await read(dev)).crash);
console.log("writing clearCrash=true ...");
await fetch(db + "/commands/bus_01/clearCrash.json?auth=" + op, { method: "PUT", body: "true" });

for (const wait of [1000, 2000, 3000, 4000]) {
  await new Promise((res) => setTimeout(res, wait === 1000 ? 1000 : 1000));
  const tel = await read(dev);
  const cmd = await (await fetch(db + "/commands/bus_01/clearCrash.json?auth=" + op)).json();
  console.log(`t+${wait}ms: crash = ${tel.crash}  | clearCrash cmd = ${cmd}`);
}
