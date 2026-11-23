# Wayline IoT Bus — Build Guide

How to build the physical side of the project: the ESP32 bus electronics, the
firmware, and the camera-based (OpenCV) tracking system — so that a real bus
behaves exactly like the simulator and appears live on the Wayline website.

> **How to use this guide.** Every step says *why* it exists. If a step doesn't
> make sense, stop and read the "why" before wiring anything. Hardware bugs are
> mostly power, wiring and pin-choice problems — understanding the circuit
> before you build is what saves you days of "mystery resets".

---

## Part 0 — What we are building, and the contract

### 0.1 The system in one picture

```
 [BUS]                                    [PC — OpenCV]
 ESP32 WROOM                               phone camera above the arena
 ├─ MPU6050 (gyro/accel)  ──── I2C ──┐     ├─ 4 coloured corner markers
 ├─ HC-SR04 (ultrasonic) ── GPIO ──┤      │    (define the map's real size)
 ├─ NEO-6M GPS (UART) ─────────────┤      ├─ red marker on top of the bus
 ├─ L298N + 2 DC motors (chassis) ─┘      └─ perspective transform → bus (x, y)
 ├─ buzzer, relay, LED
 └─ 4S battery pack + BMS
        │                                    │
        │  every 250 ms                      │  every 2–10 frames
        ▼                                    ▼
 [FIREBASE REALTIME DATABASE]  ← same device account signs in on both sides
 buses/bus_01/telemetry  { location, speed, crash, obstacle, … }
 commands/bus_01         { forceStop, clearCrash }
        │
        ▼
 [WAYLINE WEB] — operator / driver / passenger views
```

### 0.2 The data contract (what the website already expects)

The website was built and tested against a Node.js simulator, and a real bus
must write **the same JSON to the same nodes**. From `src/lib/types.ts`:

```js
// buses/{busId}/telemetry  (a device may only write its OWN bus)
{
  bus_id:       "bus_01",
  location:     { x: 0.35, y: 0.90 },   // arena metres, map is 2 m × 2 m
  speed:        12.4,                   // cm/s
  crash:        false,
  obstacle:     true,                   // ultrasonic says something is close
  obstacle_cm:  18,                     // optional, distance in cm
  motor_enabled:true,
  force_stopped:false,                  // echo of the operator's command
  ts:           ".sv"                   // server timestamp (REST syntax)
}

// events/{busId}/<pushKey>   — discrete events the operator sees
{ type: "obstacle", value: 18, ts: ".sv" }

// commands/{busId}          — operator → device (device READS this)
{ forceStop: false, clearCrash: false }
```

### 0.3 Device identity (important — read this first)

The Firebase rules do **not** trust anything about a device except its login.
Each bus is a normal Firebase Auth email/password account:

- email: `bus_01@device.local`  (already created by `npm run seed`)
- password: the `DEVICE_PASSWORD` from `.env.local`
- custom claims: `role: "device"`, `busId: "bus_01"`

The rules then say: a token with `role === 'device'` and matching `busId` may
write `buses/bus_01/telemetry`, push to `events/bus_01`, read `commands/bus_01`,
and ack `commands/bus_01/clearCrash`. Nothing else. So the firmware's first
job is **signing in with that account** — once it has an ID token, every
database call is just `…json?auth=<token>`.

> **Design decision (why the camera publishes too):** GPS cannot work at
> centimetre-to-metre scale in an arena, so the *position* comes from the
> OpenCV camera on the PC, not from the ESP32. The PC signs into **the same
> device account** (`bus_01@device.local`) and updates only the
> `location` (and `speed`) child of the telemetry node — the rules allow this
> because it's the same identity. The ESP32 owns everything else: crash,
> obstacle, motor state, and executing force-stop. Both sides writing to one
> node is fine in RTDB as long as they write *different child keys* (they do).

---

## Part 1 — Hardware

### 1.1 Parts you have (from the project budget)

| Item | Qty | Role in this build |
|---|---|---|
| ESP WROOM 32 MCU | 1 | Brain: sensors + Wi-Fi + Firebase |
| NEO-6M GPS | 1 | Positioning (kept for field/long-range use; not the arena source of truth) |
| MPU 6050 (3-axis accel + gyro) | 1 | Heading, orientation, crash (impact) detection, coarse speed |
| HC-SR04 ultrasonic | 1 | Obstacle distance → `obstacle` / `obstacle_cm` |
| 4WD Smart Car Chassis (AA8) | 1 | Frame + 2 DC gear motors + wheels |
| L298N motor driver | 1 | Drives both motors from 3.3 V logic |
| 9 V mini buzzer | 2 | Crash alarm / force-stop beeper |
| Relay module (1 ch) | 1 | Hard power-cut for the motors (emergency kill) |
| BMS 4S 40 A | 1 | Protects the 4-cell battery pack |
| Project board | 1 | Soldering/terminal board for the power side |
| 3.7 V rechargeable cells | 4 | Battery pack (the motor supply) |
| TP4056 Type-C charging module | 1 | Charges **one** cell — see 1.3 ⚠ |
| Jumper wires M/F, M/M, F/F | 40+30+40 | Wiring |
| LED | 2 | Status (link ok / crash) + marker light |

Two things you do **not** have yet, and should buy or improvise:

- **5 V supply for the ESP32 and logic** (see the power plan below — a small
  power bank with a USB cable works fine for the demo).
- **Two 1 kΩ + 2.2 kΩ resistors** for the voltage dividers (10-pack, ~LKR 100).
  The GPS and ultrasonic speak 5 V; the ESP32 is 3.3 V. This is not optional.

### 1.2 Power plan (read carefully — most "mystery" bugs live here)

The pack is 4 cells managed by a **4S** BMS, so connected in series it is a
**14.8 V** pack (16.8 V full). The L298N is happy with 14.8 V on its motor
supply (it accepts up to 30 V). The ESP32, MPU6050, GPS, buzzer and relay must
all run at **5 V**, and no 5 V signal may touch an ESP32 GPIO.

```
 4S pack (14.8 V) ──> BMS ──> L298N VIN (motor power)
                                   │
                                   ├─> 2 DC motors (via H-bridges)
                                   └─> relay coil power (motor kill switch)

 5 V supply (USB / power bank) ──> ESP32 5V pin, MPU6050 VCC, GPS VCC,
                                   buzzer VCC, relay VCC, LED
```

**Do NOT** power the ESP32 from the L298N's 5 V output pin: that regulator
only works when VIN is under ~12 V, and with a 14.8 V pack it won't regulate.
Keep the ESP32 on its own clean 5 V rail. All grounds (pack GND, BMS GND,
L298N GND, ESP32 GND) must be joined at one point.

> **Why dividers?** A GPIO is either 3.3 V logic or it is damaged. 5 V input
> above ~3.6 V can destroy the pin. A two-resistor divider (2.2 kΩ to the
> 5 V signal, 1 kΩ to GND) scales 5 V → ~1.5–2 V, which the ESP32 reads as a
> solid HIGH. This is standard practice for UART/I2C-adjacent sensors and is
> what you'll find in every ESP32 + GPS build in the field.

### 1.3 ⚠ The TP4056 trap (check before you charge!)

The TP4056 is a **single-cell (1S)** charger. A 4S pack (4 cells in series,
what the 4S BMS expects) charges at ~16.8 V with balancing — a TP4056
**cannot** do that and wiring it to the pack is a fire risk.

Check how your 4 cells are actually connected:

- **Series (4S, ~14.8 V)** — use the BMS's own charge/balance connector with a
  proper 4S (16.8 V) charger, or charge via a 4S smart-charger lead. Use the
  TP4056 only on a *separate spare cell* if you want a 1 S 5 V-boost supply.
- **Parallel (1S, ~3.7 V)** — then the 4S BMS is the wrong part (it will never
  report a valid pack voltage) and the TP4056 can charge the bank. You'd also
  be under-volted for the L298N (it works down to ~7 V for most 12 V motors).

For the demo the simplest safe route: **charge each cell individually with the
TP4056 as needed**, assemble the 4S pack, and treat "how is the pack charged
in the field" as a known open point for the report. If you have multimeter
time, verify cell voltage (3.0–4.2 V each) before assembling.

### 1.4 Pin map (ESP32 DevKit — chosen to dodge strapping pins)

Strapping pins (0, 2, 12, 15) affect boot state; we keep them free of always-on
outputs.

| Function | ESP32 pin | Notes |
|---|---|---|
| L298N IN1 (motor L fwd) | GPIO 25 | |
| L298N IN2 (motor L rev) | GPIO 26 | |
| L298N ENA (motor L speed, PWM) | GPIO 32 | `ledcWrite` |
| L298N IN3 (motor R fwd) | GPIO 27 | |
| L298N IN4 (motor R rev) | GPIO 14 | |
| L298N ENB (motor R speed, PWM) | GPIO 13 | `ledcWrite` |
| MPU6050 SDA | GPIO 21 | I2C standard pins |
| MPU6050 SCL | GPIO 22 | 4.7 kΩ pull-ups if bus lockups happen |
| HC-SR04 TRIG | GPIO 5 | |
| HC-SR04 ECHO | GPIO 18 | **5 V → divider (2.2k/1k) into 18** |
| GPS TX → ESP32 RX2 | GPIO 16 | **5 V → divider into 16**, UART2, 9600 baud |
| ESP32 TX2 → GPS RX | GPIO 17 | 3.3 V out is fine for the GPS to read |
| Buzzer (module) signal | GPIO 4 | module has its own transistor |
| Relay signal | GPIO 23 | relay module is 3.3 V logic safe |
| Status LED | GPIO 19 | with a 220 Ω resistor |

Wiring order (assemble in this order — each step is testable before the next):

1. **Chassis + motors + L298N.** Motors to YA/YB, L298N ENA/ENB/IN1..IN4 to the
   pins above. GND everywhere. *Test:* 5 V bench supply on L298N, sketch that
   toggles one motor forward/back — if it spins, power and motor wiring are
   proven before any sensor exists.
2. **MPU6050 on I2C.** *Test:* the I2C scanner sketch must find address 0x68.
   If nothing shows, it's almost always a swapped SDA/SCL or missing GND, not a
   dead sensor.
3. **GPS with dividers.** *Test:* serial monitor at 9600 on UART2 — you should
   see `$GPGGA…` sentences within ~30 s of outdoor line-of-sky. (Indoors it may
   take minutes or never fix — that's expected; the arena doesn't rely on it.)
4. **HC-SR04 with divider.** *Test:* a sketch printing distance; wave your hand
   at 20 cm and watch the number move.
5. **Buzzer, relay, LED.** *Test:* blink LED, beep buzzer, click relay and
   confirm the motor power line actually cuts (multimeter on the relay output
   contacts — the click alone proves nothing).
6. **Battery + BMS into the motor side only.** Verify pack voltage at the
   L298N terminals with the multimeter before connecting anything else.

> **Check your understanding:** why does the ECHO pin need a divider but the
> GPS RX line (GPIO 17 → GPS) doesn't? *(Answer: the divider is only needed
> when 5 V comes INTO the 3.3 V chip. Our 3.3 V TX is fine going out — 3.3 V
> is a valid "high" for the GPS's 5 V receiver.)*

---

---

## Part 2 — Firmware (ESP32)

### 2.1 Setup and libraries

Use the **Arduino IDE** (or PlatformIO if your group prefers) with the
`esp32` board package (Boards Manager → "esp32 by Espressif"). Target board:
**ESP32 Dev Module**, USB CDC on boot: **Enabled** (gives you a serial console
without wiring a USB-serial adapter).

One library does the heavy lifting:

- **Firebase-ESP32** (by MohdAli01, from the Library Manager) — it handles
  email/password sign-in, ID-token refresh, and Realtime Database
  read/write/subscribe for you.

> **Why this library and not raw HTTP?** Raw `WiFiClientSecure` POSTs to
> `…json?auth=<token>` are smaller and have fewer surprises at the limits,
> but you'd hand-roll token refresh, error retry and TLS setup. For a student
> build the Firebase-ESP32 library is the right trade: the bugs it removes
> (expired tokens, reconnects) are exactly the bugs that eat your week.
> Know the raw-HTTP route exists — the simulator shows the exact REST nodes —
> so you could port later without redesigning.

### 2.2 Firmware architecture (state machine, not blocking delays)

The classic beginner firmware is one big `loop()` full of `delay()` calls —
that blocks Wi-Fi servicing and makes force-stop feel dead. Instead, think of
the firmware as a small state machine ticked every ~250 ms:

```
 IDLE ──(drive command)──> DRIVING ──(obstacle < X cm)──> OBSTACLE_HOLD
  ^                          │                                │
  │                          └──(forceStop)──> HELD (relay cuts motor power)
  └──────────────────────────(forceStop cleared + drive again)
 CRASH (any state) ──(clearCrash command + operator ack)──> back to previous
```

Rules of thumb baked into the sketch below:

- **No `delay()` in the hot path.** Timers (`millis()`) gate the 250 ms
  telemetry tick and the 50 ms sensor ticks.
- **One JSON write per tick, small payload** (~200 bytes). RTDB loves small,
  frequent writes over one big blob.
- **Force-stop is electrical, not just logical:** the relay physically cuts
  the motor power rail. Even if Wi-Fi dies mid-command, a held relay stays
  held. That's the difference between "software stopped the bus" and "the bus
  cannot move".
- **Crash = physics, not opinions:** impact detected as accelerometer magnitude
  > ~2.5 g for a few consecutive samples. Gyro alone won't do it (spins aren't
  crashes); accel is.

### 2.3 The sketch

```cpp
#include <WiFi.h>
#include <Firebase_ESP32.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <MPU6050.h>

// ---------------- configuration (per bus) ----------------
const char* BUS_ID     = "bus_01";
const char* WIFI_SSID  = "YOUR_SSID";
const char* WIFI_PASS  = "YOUR_PASS";
const char* FB_API_KEY = "...";   // from .env.local
const char* FB_DB_URL  = "https://bus-tracking-system-2cfc8-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* FB_EMAIL   = "bus_01@device.local";   // seeded device account
const char* FB_PASS    = "DEVICE_PASSWORD";        // from .env.local

// ---------------- pins (from Part 1.4) ----------------
const int IN1=25, IN2=26, ENA=32, IN3=27, IN4=14, ENB=13;
const int TRIG=5, ECHO=18, BUZZ=4, RELAY=23, LED=19;
const int MPU_SDA=21, MPU_SCL=22;
const int GPS_RX=16, GPS_TX=17;

// ---------------- limits ----------------
const int    OBSTACLE_CM   = 20;   // below this = obstacle
const float  CRASH_G       = 2.5;  // impact threshold
const uint32_t TELEMETRY_MS = 250;
const uint32_t SENSOR_MS    = 50;

WiFiClientSecure rc;
FirebaseData fbdo;
MPU6050 mpu;

String TEL_PATH, EV_PATH, CMD_PATH;   // filled in setup()

uint32_t lastTel=0, lastSen=0, lastEcho=0;
float    obstacleCm = 1000;
bool     obstacle=false, crash=false, held=false, motorOn=false;
float    ax, ay, az; int crashTicks=0;

// ---------------- helpers ----------------
void pinsInit(){
  pinMode(IN1,OUTPUT); pinMode(IN2,OUTPUT); pinMode(ENB,OUTPUT);
  pinMode(IN3,OUTPUT); pinMode(IN4,OUTPUT); pinMode(ENA,OUTPUT);
  pinMode(TRIG,OUTPUT); pinMode(ECHO,INPUT); pinMode(BUZZ,OUTPUT);
  pinMode(RELAY,OUTPUT); pinMode(LED,OUTPUT);
  digitalWrite(RELAY, HIGH);   // relay module: LOW = engaged. Start UNengaged
}

void setMotors(int l, int r){   // -1..+1 per side
  ledcWrite(0, map(abs(l),0,1,0,255));
  ledcWrite(1, map(abs(r),0,1,0,255));
  digitalWrite(IN1, l>0); digitalWrite(IN2, l<0);
  digitalWrite(IN3, r>0); digitalWrite(IN4, r<0);
}
void motorsOff(){ setMotors(0,0); motorOn=false; }

void ultrasonic(){
  if(millis()-lastEcho < 40) return;   // HC-SR04 needs ~30 ms per ping
  lastEcho = millis();
  digitalWrite(TRIG,LOW); delayMicroseconds(2);
  digitalWrite(TRIG,HIGH); delayMicroseconds(10);
  digitalWrite(TRIG,LOW);
  long us = pulseIn(ECHO, HIGH, 30000); // 3 cm max wait; timeout = clear
  if(us>0) obstacleCm = us*0.0343;
}

void readIMU(){
  mpu.getAccel(&ax,&ay,&az);
  float g = sqrt(ax*ax+ay*ay+az*az)/16384.0; // MPU6050 raw -> g
  if(g > CRASH_G){ if(++crashTicks>2) triggerCrash(); }
  else crashTicks=0;
}

void triggerCrash(){
  if(crash) return;
  crash=true; motorsOff();
  fbdo.setResponseCode(200);
  FirebaseJson ev; ev.set("type","crash"); ev.set("value",1); ev.set("ts",".sv");
  FirebaseRTDB.push(&fbdo, EV_PATH.c_str(), &ev);
}

void publishTelemetry(){
  if(!Firebase.connected()) return;
  FirebaseJson t;
  t.set("bus_id", BUS_ID);
  t.set("crash", crash);
  t.set("obstacle", obstacle);
  t.set("obstacle_cm", (int)obstacleCm);
  t.set("motor_enabled", motorOn);
  t.set("force_stopped", held);
  // NOTE: location + speed are intentionally NOT written here —
  // the OpenCV PC owns those two children with the same device login.
  FirebaseRTDB.updateNode(&fbdo, TEL_PATH.c_str(), &t);
}

void handleCommands(){
  // polled here for simplicity; the library can also subscribe() if you
  // later need <100 ms reaction. 250 ms is plenty for a 2 m arena.
  FirebaseJson c;
  if(!FirebaseRTDB.getJSON(&fbdo, CMD_PATH.c_str(), &c)) return;
  bool forceStop = c["forceStop"] | false;
  bool clearCrash= c["clearCrash"] | false;
  if(forceStop && !held){
    held=true; motorsOff();
    digitalWrite(RELAY, LOW);            // physically cut motor power
    digitalWrite(BUZZ, HIGH);
    fbdo.setResponseCode(200);
    FirebaseRTDB.set(&fbdo, TEL_PATH + "/force_stopped", true);
  } else if(!forceStop && held){
    held=false; digitalWrite(RELAY, HIGH); digitalWrite(BUZZ, LOW);
  }
  if(clearCrash && crash){
    crash=false; crashTicks=0;
    // ack so the operator UI stops showing the crash banner
    fbdo.setResponseCode(200);
    FirebaseRTDB.set(&fbdo, CMD_PATH + "/clearCrash", false);
  }
  // simple drive commands (used by the driver page / manual mode)
  int cmd = c["driveCmd"] | 0;   // 0 stop, 1 fwd, 2 back, 3 left, 4 right
  if(!held){
    motorOn = cmd!=0;
    switch(cmd){
      case 1: setMotors( 60,  60); break;
      case 2: setMotors(-60, -60); break;
      case 3: setMotors( 0,   60); break;
      case 4: setMotors( 60,   0); break;
      default: setMotors(0, 0);
    }
  }
}

// ---------------- boot ----------------
void setup(){
  Serial.begin(115200);
  pinsInit();
  TEL_PATH = "buses/" + String(BUS_ID) + "/telemetry";
  EV_PATH  = "events/" + String(BUS_ID);
  CMD_PATH = "commands/" + String(BUS_ID);
  ledcSetup(0, 5000, 8); ledcAttachPin(ENA, 0);
  ledcSetup(1, 5000, 8); ledcAttachPin(ENB, 1);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while(WiFi.status()!=WL_CONNECTED){ delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK");

  mpu.initialize(); Wire.setClock(400000);
  Serial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);  // GPS on UART2
  Serial2.println(F("$PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0")); // fix sentences only

  rc.setInsecure(); // OK for a LAN project; in production pin a CA cert
  Firebase.begin(&fbdo, &rc, FB_API_KEY, FB_DB_URL);
  while(!Firebase.loginEmail(&fbdo, FB_EMAIL, FB_PASS)) delay(500);
  Serial.println("Firebase login OK (as "+String(FB_EMAIL)+")");

  // publish one "alive" telemetry immediately so the bus appears online
  publishTelemetry();
}

// ---------------- main loop ----------------
void loop(){
  uint32_t now = millis();
  if(!Firebase.connected() && now-lastTel>5000)  // backoff reconnect
    Firebase.reconnect();

  if(now-lastSen >= SENSOR_MS){
    lastSen=now;
    readIMU();
    ultrasonic();
    bool nowObs = obstacleCm < OBSTACLE_CM;
    if(nowObs && !obstacle){           // rising edge -> one event, not a flood
      fbdo.setResponseCode(200);
      FirebaseJson ev; ev.set("type","obstacle");
      ev.set("value",(int)obstacleCm); ev.set("ts",".sv");
      FirebaseRTDB.push(&fbdo, EV_PATH.c_str(), &ev);
    }
    obstacle=nowObs;
    if(obstacle) motorsOff();          // hold until clear
  }

  if(now-lastTel >= TELEMETRY_MS){
    lastTel=now;
    handleCommands();
    publishTelemetry();
    digitalWrite(LED, Firebase.connected());  // LED = link alive
  }
}
```

### 2.4 What to verify after flashing (in this order)

1. **Serial console** shows `Firebase login OK` — if it loops on login, the
   account/password or the API key is wrong (most common cause), not the code.
2. **Website**: log in as operator. The bus card should turn **ONLINE** within
   a second of each 250 ms tick (the app treats "telemetry fresh" as online).
3. **Force stop** from the operator page: bus stops, buzzer beeps, relay
   clicks — and if you unplug Wi-Fi *after* stopping, the bus still cannot
   move. That last part is the whole point of the relay.
4. **Crash**: smack the MPU6050 (or drive into a wall softly). The operator
   console should raise a crash alert; **Clear crash** should make the banner
   disappear (that's the `clearCrash` ack working).
5. **Obstacle**: hand in front of the HC-SR04 at 15 cm → obstacle badge + one
   event. Move it away → clears.

> **Check your understanding:** the sketch writes `telemetry` as a *single
> JSON node* every tick, but the PC writes `telemetry/location` as a *child*
> of that same node. Why doesn't the ESP32's full-node write wipe out the
> location the PC just wrote? *(Think about which library call each uses —
> `updateNode` vs `set` — and what each means in RTDB. If your answer is "they
> would clobber each other", you've found the design flaw to fix: the ESP32
> should `updateNode` (merge), never `set`, on a node it shares.)*

---

---

## Part 3 — The OpenCV tracking pipeline (phone camera → bus coordinates)

This is the tracking approach the project settled on after GPS and BLE were
ruled out, and it's the right one for an arena this size.

### 3.1 Why camera tracking (and why the others failed)

- **GPS (NEO-6M):** horizontal accuracy is ~3–10 m outdoors — your whole arena
  is 2 m. A "fix" inside 2 m means you can't even say which side of the map
  the bus is on. GPS is kept on the bus for outdoor/long-range use only.
- **BLE beacons:** no sensor hardware was available, and RSSI→distance
  estimation is unreliable indoors anyway (multi-path, orientation-dependent).
- **Overhead camera + colour markers:** the camera *sees* the whole map at
  once, position error is a few pixels (≈1–2 cm at your camera height), and
  everything you need is paper and tape. The cost is a computer watching the
  feed — which you have.

### 3.2 The pipeline, stage by stage

```
 phone camera (fixed above arena, looking straight down)
   │  4 coloured corner squares = known arena points
   │  1 red square on top of the bus = unknown point to find
   ▼
 ① get the feed onto the PC          IP Webcam app → HTTP MJPEG stream
   ▼
 ② downscale frame (e.g. width 640)  speed — phone res is wasted work
   ▼
 ③ find the 4 corner markers (HSV)   one per colour, distinct hue per corner
   ▼
 ④ compute the perspective transform  image ↔ arena (0..2 m × 0..2 m)
        (done ONCE per layout, saved to a JSON file)
   ▼
 ⑤ find the red marker (HSV, both   red wraps around the hue wheel —
      red hue ranges)               you MUST mask two ranges
   ▼
 ⑥ transform red centroid → (x, y)  metres, arena frame
   ▼
 ⑦ speed = |Δpos|/Δt, smoothed      cm/s
   ▼
 ⑧ PATCH telemetry/location + speed to Firebase (as the device account)
```

**Why a perspective transform at all?** The camera sees the map *foreshortened*
— the far edge looks shorter than the near edge, and if the camera is tilted
even slightly, squares become trapezoids. A linear "pixels ÷ map_size" math
would give you an error that grows with distance from the image centre. The
4 known corner points define the exact projective mapping from image space to
arena space; `cv2.getPerspectiveTransform` solves it in one call. That's the
whole trick of the system — corners turn a 3D photo into a 2D map.

### 3.3 Practical setup (this is where demos die — take your time here)

1. **Camera rig:** phone in a tripod or taped upright, ~1.5–2 m above the
   arena, lens axis as vertical as you can get it. The *less* tilt, the closer
   the perspective transform is to a simple scale — and the less sensitive it
   is to the phone shifting 1 cm.
2. **Lighting:** even, no direct sun or lamp glare on the floor. Shadows from
   the phone stand kill marker detection more often than anything else. If a
   corner flickers in the debug view, move the light before touching any code.
3. **Markers:** matte paper (glossy tape reflects and changes hue), ~10–15 cm
   squares, exactly at the 4 arena corners. Pick 4 well-separated hues and
   **never change which colour sits at which corner** — the calibration stores
   that assignment. Suggested: yellow = near-left, green = near-right,
   cyan = far-right, magenta = far-left.
4. **Red marker on the bus:** small matte red square (~8–10 cm) on top, flat.
   Anything else red on the map (tape, a bag) becomes a false positive — the
   detector takes the largest red blob, so keep the bus's marker the biggest
   red thing in frame.
5. **Phone feed:** install **IP Webcam** (free, Android/iOS), run it, note the
   stream URL it prints (`http://<phone-ip>:8080/video`), and set the phone to
   a **fixed Wi-Fi IP** (phone settings → Wi-Fi → your network → static IP)
   so the URL doesn't change every reboot. Put PC and phone on the same LAN;
   5 GHz Wi-Fi if the router has it (less congestion, lower latency).

### 3.4 The tracker program (PC side, Python)

```python
# tracker.py  —  pip install opencv-python numpy requests
import cv2, json, time, math, argparse, requests

DB   = "https://bus-tracking-system-2cfc8-default-rtdb.asia-southeast1.firebasedatabase.app"
API  = "YOUR_API_KEY"
EMAIL, PASS = "bus_01@device.local", "DEVICE_PASSWORD"
BUS  = "bus_01"
FEED = "http://192.168.1.50:8080/video"     # IP Webcam stream
CORNERS = "arena_corners.json"
ARENA = 2.0                                  # metres, map is 2 m × 2 m
WANT_W = 640                                 # process at this width

# colour → which arena corner (fixed assignment, metres)
COLORS = {
    "yellow": (( 30, 30, 55), ( 50, 255, 255), (0.0, 0.0)),  # near-left
    "green":  (( 50, 60, 55), ( 80, 255, 255), (0.0, ARENA)),# near-right
    "cyan":   (( 80, 60, 55), (100, 255, 255), (ARENA, ARENA)),  # far-right
    "magenta":((140, 60, 55), (170, 255, 255), (ARENA, 0.0)),  # far-left
}
RED_LO1, RED_HI1 = (0, 120, 80),     (10, 255, 255)   # red part 1
RED_LO2, RED_HI2 = (170, 120, 80),   (180, 255, 255)  # red part 2 (wrap)

def find_blob(frame, lo, hi, min_area=60):
    """HSV range → centroid of the biggest blob, or None."""
    mask = cv2.inRange(cv2.cvtColor(frame, cv2.COLOR_BGR2HSV), lo, hi)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(c) < min_area:
        return None
    m = cv2.moments(c)
    return (m["m10"] / m["m00"], m["m01"] / m["m00"])

def grab_frame(cap, want_w):
    ok, frame = cap.read()
    if not ok or frame is None:
        return None
    scale = want_w / frame.shape[1]
    return cv2.resize(frame, (want_w, int(frame.shape[0] * scale)))

def calibrate(cap):
    """Print detected corners; press 'c' when all 4 are steady to save."""
    print("Calibration: check all 4 corners print stable, then press c.")
    while True:
        frame = grab_frame(cap, WANT_W)
        if frame is None:
            time.sleep(0.5); continue
        pts = {}
        for name, (lo, hi, _) in COLORS.items():
            b = find_blob(frame, lo, hi)
            if b:
                pts[name] = b
                cv2.circle(frame, (int(b[0]), int(b[1])), 6, (0, 255, 0), -1)
        cv2.putText(frame, f"{len(pts)}/4 corners", (10, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.imshow("calibrate", frame)
        if len(pts) == 4 and cv2.waitKey(1) & 0xFF == ord("c"):
            save = {n: [COLORS[n][2], pts[n]] for n in pts}  # [arena, image]
            json.dump(save, open(CORNERS, "w"))
            print(f"Saved {CORNERS}"); break
        time.sleep(0.05)

def build_transform(corners):
    src = numpy_pts([c[1] for c in corners.values()])
    dst = numpy_pts([c[0] for c in corners.values()])
    return cv2.getPerspectiveTransform(src, dst)

def numpy_pts(pairs):
    import numpy as np
    return np.float32(pairs)

class FirebaseRT:
    """Tiny RTDB REST client — device login, token refresh, partial PATCH."""
    def __init__(self):
        self.token = None; self.exp = 0
    def login(self):
        r = requests.post(
            f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API}",
            json={"email": EMAIL, "password": PASS, "returnSecureToken": True},
            timeout=10).json()
        if "idToken" not in r:
            raise SystemExit(f"device login failed: {r}")
        self.token = r["idToken"]; self.exp = time.time() + 50 * 60
    def call(self, method, path, payload):
        if time.time() > self.exp:
            self.login()
        for attempt in (1, 2):
            url = f"{DB}/{path}.json?auth={self.token}"
            r = requests.request(method, url, json=payload, timeout=5)
            if r.status_code == 401 and attempt == 1:  # expired mid-run
                self.login(); continue
            break
        if r.status_code >= 300:
            print("  fb error", r.status_code, r.text[:120])
        return r.ok

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrate", action="store_true")
    ap.add_argument("--no-firebase", action="store_true")
    args = ap.parse_args()

    cap = cv2.VideoCapture(FEED)
    time.sleep(2.0)                       # let the stream warm up
    if not cap.isOpened():
        raise SystemExit(f"cannot open {FEED}")

    if args.calibrate:
        calibrate(cap); cv2.destroyAllWindows(); return

    corners = json.load(open(CORNERS))
    M = build_transform(corners)
    fb = None if args.no_firebase else FirebaseRT()
    if fb: fb.login()
    print("tracking…  (q quits)")

    last = None; speed = 0.0; t_last = time.time()
    while True:
        frame = grab_frame(cap, WANT_W)
        if frame is None:
            time.sleep(0.5); continue
        red = None
        for lo, hi in ((RED_LO1, RED_HI1), (RED_LO2, RED_HI2)):
            red = find_blob(frame, lo, hi, min_area=30)
            if red: break
        now = time.time()
        if red:
            hom = numpy_pts([[red[0], red[1], 1.0]])[0]  # (x, y, 1)
            pt = M @ hom                                  # 3x3 @ 3 → (x', y', w)
            x, y = float(pt[0] / pt[2]), float(pt[1] / pt[2])
            if last is not None and (now - t_last) > 0.15:
                inst = math.hypot(x - last[0], y - last[1]) / (now - t_last) * 100
                speed = 0.7 * speed + 0.3 * inst     # EMA, cm/s
            last, t_last = (x, y), now
            cv2.circle(frame, (int(red[0]), int(red[1])), 8, (0, 0, 255), -1)
            cv2.putText(frame, f"x={x:.2f} y={y:.2f} v={speed:.0f}cm/s",
                        (10, frame.shape[0] - 12),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            if fb:
                fb.call("PATCH", f"buses/{BUS}/telemetry",
                        {"location": {"x": round(x, 3), "y": round(y, 3)},
                         "speed": round(speed, 1)})
        else:
            speed = 0.0
            cv2.putText(frame, "bus marker lost", (10, 25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        for n, c in corners.items():        # draw corners in debug view
            cv2.circle(frame, (int(c[1][0]), int(c[1][1])), 6, (0, 255, 0), -1)
        cv2.imshow("tracker", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
```

Run order:

```
python tracker.py --calibrate     # corners steady → press c → file saved
python tracker.py                 # live tracking, publishes to Firebase
python tracker.py --no-firebase   # debug mode: no DB writes
```

### 3.5 The details that decide accuracy

- **Two red ranges, always.** In HSV, hue is a wheel from 0–179 (OpenCV halves
  the 0–360 scale). Red sits *at the seam* — hue 0 and hue 179 are both red.
  One mask catches half the red marker and you'll see it blink in and out.
- **`PATCH`, never full `PUT`, from the PC.** A `PATCH` to
  `telemetry` with only `location` and `speed` replaces exactly those two
  children and leaves the ESP32's `crash`/`obstacle` fields untouched. A full
  node write would wipe the firmware's half of the node every 200 ms.
- **Calibration is per-layout.** Move the camera, the arena sheet, or a corner
  marker → recalibrate. (The transform is a snapshot of one camera pose.)
- **Rate limit the DB writes** (the 0.15 s gate on speed + publishing inside
  the same loop ≈ 5–8 writes/s is fine, but don't publish every pixel). RTDB
  is fast, but a runaway loop at 60 Hz of writes looks like an attack to your
  billing dashboard.
- **Debug overlay is your instrument.** If "bus marker lost" blinks when the
  bus is clearly in frame, lower `min_area` or loosen the red saturation floor
  (`120 → 90`) — that's lighting, not a code bug.

> **Check your understanding:** why do we store *both* the arena coordinate and
> the image coordinate for each corner in `arena_corners.json`, instead of just
> the image coordinate? *(It's about what `getPerspectiveTransform` needs to
> solve — one set of points in each space, paired by meaning. Without the
> arena side there'd be no ground truth for the mapping to be "correct".)*

---

---

## Part 4 — Putting it all together

### 4.1 End-to-end test plan (in this exact order — each step is provable)

| # | Test | Expected | If it fails, suspect |
|---|---|---|---|
| 1 | L298N bench test (no ESP32) | Motor spins fwd/rev on pin toggles | motor wires, VIN power |
| 2 | I2C scanner with MPU6050 | Finds address `0x68` | SDA/SCL swap, missing GND |
| 3 | GPS serial monitor (outdoor) | `$GPGGA` within ~30 s | 5 V rail, divider, baud 9600 |
| 4 | Ultrasonic sketch | Distance tracks your hand | TRIG/ECHO, echo divider |
| 5 | Relay click + multimeter | Motor rail voltage goes 0 V | relay contacts, coil VCC |
| 6 | Flash firmware → serial log | `Firebase login OK` | device account/password/API key |
| 7 | Operator page → bus card | **ONLINE** within ~1 s | rules, token claims, busId match |
| 8 | Force stop (operator) | Stops, beeps, relay cuts | commands node read, relay pin |
| 9 | Impact on MPU6050 | Crash banner → Clear crash clears it | accel scale, event write |
| 10 | Hand at 15 cm (ultrasonic) | Obstacle badge + 1 event | threshold, divider on ECHO |
| 11 | Tracker `--calibrate` | 4/4 corners steady, file saved | lighting, hue ranges, marker size |
| 12 | Tracker live, bus in frame | x/y readout matches where the bus is | transform, corner assignment |
| 13 | Bus moves on website | Dot follows the real bus | location PATCH, arena map scale |
| 14 | Kill Wi-Fi after force-stop | Bus still cannot move | (this is the relay, verify it) |
| 15 | Full demo run (3 laps) | No crash/obstacle events, speed sane | everything — record it |

### 4.2 Fault tree (when something is wrong, don't guess)

- **Bus offline on website but serial says login OK** → check the *exact*
  `bus_id` string: RTDB path `buses/<id>` is case-sensitive and must equal the
  claim's `busId` and the website's bus list. One `Bus_01` vs `bus_01` mismatch
  writes to a node nobody reads.
- **Telemetry arrives but dot doesn't move** → the PC's location writes are
  missing (tracker not running, or 401 in its console). Watch
  `telemetry/location` in the Firebase console while the bus is in frame.
- **Dot moves but in the wrong place / mirrored** → corner assignment: your
  yellow and cyan corners are swapped in the `COLORS` table or the saved file.
  The transform is mathematically "correct" for the *wrong* mapping.
- **Dot lags badly** → Wi-Fi congestion between phone and PC (try 5 GHz /
  closer router), or the feed resolution is huge (keep the 640-downscale).
- **Speed reads wildly** → jitter: lower the EMA weight (`0.3 → 0.15`) or
  raise the 0.15 s gate; don't chase 60 Hz position deltas.
- **ESP32 reboots under load** → almost always the power rail: a 14.8 V pack
  through the L298N pulling both motors + a thin 5 V rail for the ESP32 drops
  under motor start. Decouple with a 470–1000 µF cap across the L298N motor
  supply and keep the ESP32 on its own supply (the Part 1 power plan exists
  for this reason).
- **`Firebase login OK` loops forever** → wrong device password, or the
  account wasn't seeded for *this* busId (`npm run seed` in `C:\dev\wayline`).

### 4.3 Demo-day runbook

Before the demo (the day or the night before):

1. Charge every cell to 4.1–4.2 V, assemble the pack, verify 14.8–16.8 V at
   the BMS output with the multimeter.
2. Tape the 4 corner markers + the red bus marker (double-sided tape, flat).
3. Set the phone to its static IP, start IP Webcam, confirm the stream opens
   in a browser tab on the PC.
4. `python tracker.py --calibrate` → save. `python tracker.py --no-firebase`
   → 10-second watch: 4/4 corners, red lock steady.
5. Flash the ESP32 with fresh firmware, confirm `Firebase login OK`.
6. Full 3-lap dry run while someone watches the operator page on a phone.

During the demo: operator on one screen, passenger view on a phone,
force-stop in hand. If anything looks off, force-stop is the dignified
answer — and it *proves* the safety design.

### 4.4 What the report should say (tie it to the work)

Your progress report already names the two tracking pivots (GPS → too coarse,
BLE → unavailable) and the camera/OpenCV approach. With this guide you can now
answer the follow-up questions a supervisor will actually ask:

- *How does the website know where the bus is?* — overhead camera, four
  calibrated corner markers, perspective transform, (x, y) in arena metres.
- *What does the ESP32 do then?* — everything position *except*: obstacle
  sensing, crash detection, motor control, and the safety-critical force-stop
  that's electrical, not software.
- *Who is allowed to write what?* — per-bus device accounts; RTDB rules
  scope every write to the owner's own nodes.
- *What happens when Wi-Fi dies?* — telemetry stops (bus goes "offline" on
  the site) and a held force-stop stays held. The design fails *safe*.

### 4.5 Where to grow it (only if asked — don't scope-creep the demo)

- **ArUco markers** instead of solid colours: OpenCV's `aruco` module detects
  markers with their *identity* baked in, so you don't need four different
  colours and the transform gets an 8-point check on top of the corners.
- **Encoders on the motors** for true speed (currently speed is derived from
  camera position deltas — good enough, but it's not the motor's own truth).
- **Multiple buses**: the architecture already supports it — one device
  account per bus, one red marker per bus (different top-marker colours,
  one detector per colour, same transform).
- **Autonomous driving** along the registered routes: the operator route data
  is already in Firebase; the firmware could follow waypoints with the IMU +
  camera position. That's a follow-up project, not this one.

---

*That's the full build: hardware (Part 1) → firmware (Part 2) → camera
tracking (Part 3) → verification (Part 4). The one rule that keeps it sane:
every layer is tested alone before the next one exists.*
