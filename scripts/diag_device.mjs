// one-off diagnostic: does bus_01's device user exist, and does the sketch password match .env.local?
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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

const ino = fs.readFileSync("firmware/bus_firmware/bus_firmware.ino", "utf8");
const sketchPass = (ino.match(/FB_PASS\s*=\s*"([^"]*)"/) || [])[1];
const sketchEmail = (ino.match(/FB_EMAIL\s*=\s*"([^"]*)"/) || [])[1];

console.log("env has DEVICE_PASSWORD:", !!env.DEVICE_PASSWORD);
console.log("sketch FB_EMAIL:", sketchEmail);
console.log("sketch FB_PASS === .env DEVICE_PASSWORD:", sketchPass === env.DEVICE_PASSWORD);
console.log("sketch has any FB_PASS set:", !!sketchPass);
console.log("sketch FB_API_KEY === .env API key:", (ino.match(/FB_API_KEY\s*=\s*"([^"]*)"/) || [])[1] === env.NEXT_PUBLIC_FIREBASE_API_KEY);
console.log("sketch FB_DB_URL === .env DB URL:", (ino.match(/FB_DB_URL\s*=\s*"([^"]*)"/) || [])[1] === env.NEXT_PUBLIC_FIREBASE_DATABASE_URL);

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});
const auth = getAuth(app);
try {
  const u = await auth.getUserByEmail("bus_01@device.local");
  console.log("device user EXISTS. claims:", JSON.stringify(u.customClaims));
} catch (e) {
  console.log("device user MISSING:", e.message);
}
process.exit(0);
