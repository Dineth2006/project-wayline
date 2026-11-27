# Wayline - Smart Real-Time Bus Tracking & Safety Management System

A full-stack IoT and web platform for real-time public bus tracking, driver monitoring, passenger seat booking, and remote safety intervention. Built with **Next.js (App Router)**, **Firebase Realtime Database & Authentication**, **OpenStreetMap (Leaflet)**, and an **ESP32-WROOM-32** hardware prototype.

---

## Features

### Operator Console (`/operator`)
- **Live Fleet Map:** Switch between a custom **2D Arena Map** (`WaylineMap`) and **OpenStreetMap** (`OSMMap` via Leaflet, centered at SLIIT Malabe Campus).
- **Route & Stop Editor:** Create, edit, and assign routes with waypoints, stops, and deviation tolerance thresholds.
- **Safety & Emergency Intervention:** Real-time crash and route-deviation alerts, remote **Force Stop** (cuts motor power via relay and sounds onboard buzzer), **Clear Crash** reset, and driver warning messages.
- **Driver Performance & Reports:** Behaviour scoring from onboard IMU/sensor events, passenger ratings, and **PDF report export** (`jspdf` / `jspdf-autotable`).
- **Fleet & User Management:** Register buses, create driver/operator accounts, and assign drivers to buses via Firebase Admin API routes.

### Driver Workspace (`/driver`)
- **Live Trip Dashboard:** Displays next stop, live ETA, route progress, current speed (`cm/s`), and live map position.
- **Remote Drive Controls (`DrivePad`):** Touch/mouse controls (`F`, `B`, `L`, `R`, `S`, `FF`, and `X` abort) that stream commands to `commands/<busId>/drive` when the bus is online and unlocked.
- **Operator Warnings:** Receive and acknowledge real-time operator messages (`commands/<busId>/warningAck`).
- **Trip Summary:** View driver safety score, ratings, and incident log.

### Passenger Portal (`/passenger`)
- **Live Bus Tracking & ETA:** View active buses on the map, check route progress, and see estimated arrival times at stops.
- **Seat Booking:** Reserve or release available seats in real time (`seats/<busId>`).
- **Geofencing Alerts:** Configure personal geofence zones (`geofences/<uid>`) for approaching/leaving bus notifications.
- **Ratings:** Submit 1–5 star ratings and feedback per bus (`ratings/<busId>`).

### ESP32 Bus Unit (`bus_firmware.ino`)
- **GPS Location & Speed:** Reads NMEA data from a **NEO-6M GPS** module via `TinyGPS++` (defaults to SLIIT Malabe Campus `6.91435, 79.97268` until a satellite fix is acquired).
- **Crash Detection:** Reads 3-axis acceleration from an **MPU6050** (`±8g` range) over I2C and triggers crash lock + event logging above `2.5g`.
- **Obstacle Avoidance:** Measures front distance using an **HC-SR04** ultrasonic sensor and halts motors below `20 cm`.
- **Motor & Force-Stop Hardware:** Drives two motor channels via **L298N** PWM, cuts the motor power rail via a **1-channel Relay**, activates a **Buzzer** on force-stop, and indicates Firebase link health on a **Status LED**.
- **Captive WiFi Setup Portal:** Falls back to a `Bus_01_Setup` AP portal (`Preferences` + `WebServer` + `DNSServer`) if saved WiFi credentials are unreachable.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | Next.js 16.4.2 (App Router), React 19, TypeScript 5, Tailwind CSS v4, Framer Motion, Lucide Icons |
| **Maps** | Leaflet (`leaflet`) with OpenStreetMap tiles + custom SVG 2D arena renderer |
| **Backend & Auth** | Firebase Authentication (custom role claims: `operator`, `driver`, `passenger`, `device`), Firebase Realtime Database, Firebase Admin SDK |
| **PDF Export** | `jspdf`, `jspdf-autotable` |
| **IoT Firmware** | ESP32-WROOM-32 (Arduino core), `ArduinoJson`, `TinyGPSPlus`, HTTPS REST + `WiFiClientSecure` |

---

## Hardware Wiring (ESP32-WROOM-32)

| Module | Pin / Signal | ESP32 GPIO | Notes |
| --- | --- | --- | --- |
| **L298N Motor Driver** | `ENA` / `ENB` (PWM) | `GPIO32` / `GPIO13` | Remove `ENA`/`ENB` jumper caps (5 kHz PWM) |
| **L298N Motor Driver** | `IN1` / `IN2` (Left) | `GPIO25` / `GPIO26` | Left-side motor direction |
| **L298N Motor Driver** | `IN3` / `IN4` (Right) | `GPIO27` / `GPIO14` | Right-side motor direction |
| **MPU6050 (GY-521)** | `SDA` / `SCL` | `GPIO21` / `GPIO22` | `VCC` → `3.3V`, `AD0` → `GND` (I2C `0x68`) |
| **HC-SR04 Ultrasonic** | `TRIG` / `ECHO` | `GPIO5` / `GPIO18` | `ECHO` stepped down to ~3.3 V via `1kΩ` / `2kΩ` divider |
| **NEO-6M GPS** | `TX` / `RX` | `GPIO16` / `GPIO17` | `UART2` at `9600` baud (use 3.3 V logic/divider on `TX` → `GPIO16`) |
| **1-Ch Relay** | `IN` | `GPIO23` | `LOW` = engaged (opens motor battery rail on force-stop) |
| **Buzzer Module** | `Signal` | `GPIO4` | `HIGH` = active on force-stop |
| **Status LED** | `+` (via `220Ω`) | `GPIO19` | `HIGH` when WiFi + Firebase telemetry writes succeed |

> **Power Note:** Power the ESP32 and 5 V logic sensors from a separate 5 V supply, independent of the L298N motor battery rail. Never connect USB and external `VIN` 5 V simultaneously when flashing.

---

## Firebase RTDB Structure & Security Rules

Access control is enforced in [`database.rules.json`](database.rules.json) using Firebase Auth custom claims (`role` and `busId`):

- `buses/<busId>/meta` - Bus metadata (`name`, `plate`, `routeId`, `seats`, `color`, `driverUid`, `driverName`)
- `buses/<busId>/telemetry` - Live device telemetry (`location: { x, y }`, `speed`, `crash`, `obstacle`, `obstacle_cm`, `motor_enabled`, `force_stopped`, `connected`, `ts`)
- `routes/<routeId>` - Route waypoints, stops, closed flag, and deviation `tolerance`
- `commands/<busId>` - `drive` (`{ cmd, ts }`), `forceStop`, `clearCrash`, `warning`, `warningAck`
- `events/<busId>` - Timestamped `crash` and `obstacle` logs
- `alerts` - Active crash and route-deviation alerts
- `seats/<busId>` & `ratings/<busId>` - Passenger seat reservations and ratings
- `geofences/<uid>` - Per-user geofence definitions
- `settings` - Map mode (`"arena"` or `"google"` for OpenStreetMap)

---

## Getting Started

### 1. Prerequisites
- **Node.js** 20+ and **npm**
- A **Firebase** project with **Authentication** (Email/Password enabled) and **Realtime Database** enabled
- A Firebase **Service Account** private key (for Admin API routes and seeding)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.local.example` to `.env.local` and fill in your Firebase web config, Admin SDK credentials, and seed passwords:
```bash
cp .env.local.example .env.local
```

Required variables in `.env.local`:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_DATABASE_URL`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`
- `SEED_OPERATOR_EMAIL`, `SEED_OPERATOR_PASSWORD`, `DEVICE_PASSWORD`

### 4. Deploy Database Rules & Seed Initial Data
```bash
node --env-file=.env.local scripts/deploy_rules.mjs
npm run seed
```

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Optional: Run the Bus Telemetry Simulator
To simulate `bus_02` moving along `loop_a` without hardware:
```bash
node --env-file=.env.local scripts/simulate.mjs bus_02
```

### 7. Flash the ESP32 Firmware
1. Open `bus_firmware.ino` in **Arduino IDE** (board: **ESP32 Dev Module**, upload speed: `115200`).
2. Install **ArduinoJson** and **TinyGPSPlus** from the Arduino Library Manager.
3. Update `BUS_ID`, `WIFI_SSID`, `WIFI_PASS`, `FB_API_KEY`, `FB_DB_URL`, `FB_EMAIL`, and `FB_PASS` as needed, then upload.

---

## Project Structure

```text
wayline/
├── database.rules.json          # Firebase RTDB security & validation rules
├── scripts/                     # Seeding, rule deployment, diagnostics & simulator
│   ├── seed.mjs
│   ├── simulate.mjs
│   ├── deploy_rules.mjs
│   └── ...
└── src/
    ├── app/
    │   ├── driver/page.tsx      # Driver trip view & DrivePad controls
    │   ├── operator/page.tsx    # Operator fleet & safety console
    │   ├── passenger/page.tsx   # Passenger tracking, booking & geofences
    │   ├── login/page.tsx       # Role-aware authentication
    │   ├── api/                 # Next.js Admin API routes (users, buses, rules)
    │   ├── icon.svg             # App favicon
    │   └── layout.tsx
    ├── components/              # LiveMap, OSMMap, WaylineMap, RouteEditor, reports
    ├── context/AuthContext.tsx  # Firebase Auth + custom claims context
    ├── hooks/                   # Realtime DB listeners, geofence & alert engines
    └── lib/                     # Firebase client/admin init, geometry, ETA, PDF export
```

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run seed` | Seed operator, device accounts, buses, and default route |

---
