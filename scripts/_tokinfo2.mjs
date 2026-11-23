
import fs from "fs";
import crypto from "crypto";
const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) {
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[line.slice(0, i).trim()] = v;
  }
}
console.log("dbUrl var:", env.NEXT_PUBLIC_FIREBASE_DATABASE_URL);
const dbUrl = env.NEXT_PUBLIC_FIREBASE_DATABASE_URL.replace(/\/$/, "");
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const now = Math.floor(Date.now() / 1000);
const payload = b64url(JSON.stringify({ iss: env.FIREBASE_ADMIN_CLIENT_EMAIL, scope: "https://www.googleapis.com/auth/firebase.database", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
const sig = b64url(crypto.createSign("RSA-SHA256").update(header + "." + payload).sign(privateKey));
const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + encodeURIComponent(header + "." + payload + "." + sig) })).json();
const t = tok.access_token;
const url1 = dbUrl + "/bus_01/telemetry.json?access_token=" + t;
console.log("req1 url (token masked):", url1.replace(t, t.slice(0, 8) + "..."));
const r1 = await fetch(url1);
console.log("query-param: HTTP", r1.status, await r1.text());
const r2 = await fetch(dbUrl + "/bus_01/telemetry.json", { headers: { Authorization: "Bearer " + t } });
console.log("bearer-hdr:  HTTP", r2.status, (await r2.text()).slice(0, 300));
