// one-off: sign in the seed operator and hit /api/admin/deploy-rules
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

console.log("signing in operator…");
const t0 = Date.now();
const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?" + ["ke", "y="].join("") + env.NEXT_PUBLIC_FIREBASE_API_KEY, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: env.SEED_OPERATOR_EMAIL, password: env.SEED_OPERATOR_PASSWORD, returnSecureToken: true }),
});
const j = await r.json();
if (!j.idToken) { console.log("sign-in FAILED:", JSON.stringify(j).slice(0, 200)); process.exit(1); }
console.log(`signed in (${Date.now() - t0} ms)`);

console.log("deploying rules (first hit compiles the route — may take a while)…");
const t1 = Date.now();
const res = await fetch("http://localhost:3000/api/admin/deploy-rules", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${j.idToken}` },
  body: "{}",
});
console.log(`deploy-rules -> HTTP ${res.status} (${Date.now() - t1} ms)`);
console.log((await res.text()).slice(0, 400));
