// bus_02 simulator: drives a virtual bus around the loop_a rectangle and
// writes telemetry to RTDB exactly like a real device (same device login).
// Usage: node scripts/simulate.mjs   (stop with Ctrl+C)
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

const BUS_ID = process.argv[2] ?? "bus_02";
const LOCATION_ONLY = process.argv.includes("--location-only");
// location-only: this process only owns location+speed (a real device/tracker
// owns the rest) — written via PATCH so fields never clobber each other
const TICK_MS = 250;
const SPEED_CM_S = 40;                 // matches web Telemetry.speed units
const STEP_M = SPEED_CM_S / 100 / (1000 / TICK_MS); // metres per tick

// 1) device sign-in
const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + env.NEXT_PUBLIC_FIREBASE_API_KEY, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `${BUS_ID}@device.local`, password: env.DEVICE_PASSWORD, returnSecureToken: true }),
});
const j = await r.json();
if (!j.idToken) { console.log("sign-in FAILED:", JSON.stringify(j).slice(0, 200)); process.exit(1); }
console.log(`${BUS_ID} signed in as device`);

// 2) load route points (arena units = metres, 2m canvas)
const route = await (await fetch(dbUrl + "/routes/loop_a.json?auth=" + j.idToken)).json();
if (!route?.points?.length) { console.log("route loop_a not found"); process.exit(1); }
const pts = route.points;
const corners = pts.map((p) => [p.x, p.y]);

// 3) walk the loop
let seg = 0, t = 0;
let [x, y] = [corners[0][0], corners[0][1]];
let stopped = false, crash = false;

const put = async (payload) => {
  await fetch(dbUrl + `/buses/${BUS_ID}/telemetry.json?auth=` + j.idToken, {
    method: "PATCH", // merge — never wipe fields owned by the real device
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

console.log("running — Ctrl+C to stop");
while (true) {
  // commands — full mode only. In location-only mode the PHYSICAL device owns
  // the command node; this process must never delete it (or Clear-crash dies).
  if (LOCATION_ONLY) {
    const tel = await (await fetch(dbUrl + `/buses/${BUS_ID}/telemetry.json?auth=` + j.idToken)).json();
    stopped = !!tel?.force_stopped; // mirror the device's hold -> speed drops to 0
  } else {
    const cmd = await (await fetch(dbUrl + `/commands/${BUS_ID}.json?auth=` + j.idToken)).json();
    if (cmd?.forceStop) stopped = true;
    if (cmd?.clearCrash) { crash = false; stopped = false; seg = 0; t = 0; }
    if (cmd && Object.keys(cmd).length) {
      await fetch(dbUrl + `/commands/${BUS_ID}.json?auth=` + j.idToken, { method: "DELETE" });
    }
  }

  // advance along the segment
  if (!stopped) {
    const [x2, y2] = corners[(seg + 1) % corners.length];
    const dx = x2 - x, dy = y2 - y;
    const dist = Math.hypot(dx, dy);
    if (dist > STEP_M) {
      x += (dx / dist) * STEP_M;
      y += (dy / dist) * STEP_M;
    } else {
      seg = (seg + 1) % corners.length;
      [x, y] = corners[seg];
      t = 0;
    }
  }

  await put(LOCATION_ONLY
    ? {
        location: { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) },
        speed: stopped ? 0 : SPEED_CM_S,
      }
    : {
        bus_id: BUS_ID,
        location: { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) },
        speed: stopped ? 0 : SPEED_CM_S,
        crash,
        obstacle: false,
        obstacle_cm: 250,
        motor_enabled: !stopped,
        force_stopped: stopped,
        connected: true,
        ts: Date.now(),
      });

  if (Date.now() % 10000 < TICK_MS) console.log(`tick  pos=(${x.toFixed(2)},${y.toFixed(2)}) stopped=${stopped}`);
  await new Promise((res) => setTimeout(res, TICK_MS));
}
