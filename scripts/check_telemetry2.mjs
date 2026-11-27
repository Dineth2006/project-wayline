// one-off check: is bus_01 telemetry live in RTDB? (REST + service-account JWT, 2 reads 3 s apart)
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
const dbUrl = env.NEXT_PUBLIC_FIREBASE_DATABASE_URL.replace(/\/$/, "");
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;

const b64url = (buf) => Buffer.from(buf).toString("base64url");

// 1) sign a service-account JWT -> exchange for an access token
const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const now = Math.floor(Date.now() / 1000);
const payload = b64url(JSON.stringify({
  iss: clientEmail,
  scope: "https://www.googleapis.com/auth/firebase.database",
  aud: "https://oauth2.googleapis.com/token",
  iat: now,
  exp: now + 3600,
}));
const sig = b64url(crypto.createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey));
const jwt = `${header}.${payload}.${sig}`;

const tok = await (await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(jwt)}`,
})).json();
if (!tok.access_token) { console.log("token exchange FAILED:", JSON.stringify(tok)); process.exit(1); }

// 2) read telemetry twice, 3 s apart
const read = async () => {
  const r = await fetch(`${dbUrl}/bus_01/telemetry.json?access_token=${tok.access_token}`);
  return r.json();
};

const show = async (label) => {
  const v = await read();
  if (v === null) { console.log(`${label}: bus_01/telemetry does NOT exist - device has written nothing`); return; }
  const age = v.ts ? Math.round((Date.now() - Number(v.ts)) / 1000) : "?";
  console.log(`${label}: ${JSON.stringify(v)}  | ts age: ${age}s`);
};

await show("1st read");
await new Promise((r) => setTimeout(r, 3000));
await show("2nd read");
