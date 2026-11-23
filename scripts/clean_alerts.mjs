// One-off: clean stale/junk nodes from the alerts/ tree.
// Keeps deterministic keys (bus_<id>_crash | bus_<id>_deviation), deletes the rest.
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
  body: JSON.stringify({ email: env.SEED_OPERATOR_EMAIL, password: env.SEED_OPERATOR_PASSWORD, returnSecureToken: true }),
});
const j = await r.json();
if (!j.idToken) { console.log("operator sign-in FAILED"); process.exit(1); }
console.log("operator signed in");

const alerts = await (await fetch(dbUrl + "/alerts.json?auth=" + j.idToken)).json();
const keys = Object.keys(alerts ?? {});
const junk = keys.filter((k) => !/^bus_[A-Za-z0-9]+_(crash|deviation)$/.test(k));
for (const k of junk) {
  await fetch(dbUrl + `/alerts/${k}.json?auth=` + j.idToken, { method: "DELETE" });
}
console.log("keys found :", keys.join(", ") || "(none)");
console.log("deleted junk:", junk.join(", ") || "(none)");
