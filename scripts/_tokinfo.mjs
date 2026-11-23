
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
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const now = Math.floor(Date.now() / 1000);
const payload = b64url(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/firebase.database", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
const sig = b64url(crypto.createSign("RSA-SHA256").update(header + "." + payload).sign(privateKey));
const jwt = header + "." + payload + "." + sig;
const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + encodeURIComponent(jwt) })).json();
console.log("token ok:", !!tok.access_token, "scope:", tok.scope);
const info = await (await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + tok.access_token)).json();
console.log("tokeninfo:", JSON.stringify(info));
