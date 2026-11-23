/*
 * Wayline IoT Bus — ESP32 firmware
 * ---------------------------------
 * Bus:    bus_01 (edit BUS_ID + credentials below per bus)
 * Role:   everything EXCEPT position — obstacle sensing, crash detection,
 *         motor control, electrical force-stop. Position (location/speed)
 *         is published by the OpenCV tracker on the PC using the SAME
 *         device account; both sides write different children of the
 *         same telemetry node, so they never clobber each other.
 *
 * Stack:  ESP32 DevKit, Arduino IDE (or PlatformIO)
 *         - Board package: "esp32 by Espressif"
 *         - USB CDC On Boot: Enabled
 *         - Libraries: Firebase-ESP32 (MohdAli01),
 *                      Adafruit MPU6050
 *
 * Wiring (see docs/iot-build-guide.md Part 1.4 for the full table):
 *   L298N  IN1=25 IN2=26 ENA=32  IN3=27 IN4=14 ENB=13
 *   MPU6050 SDA=21 SCL=22        GPS TX->16 RX<-17 (5V->divider into 16)
 *   HC-SR04 TRIG=5  ECHO=18 (5V->divider into 18)
 *   Buzzer(GPIO module)=4  Relay=23  Status LED=19 (220 ohm)
 *   Power: 4S pack via BMS -> L298N VIN (motors only). ESP32 + all logic
 *   on a SEPARATE 5 V supply. Do NOT take ESP32 5 V from L298N 5V-out
 *   with a 14.8 V pack.
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <time.h>
#include <FirebaseESP32.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// ================== configuration (per bus) ==================
const char* BUS_ID     = "bus_01";
const char* WIFI_SSID  = "SLT_Fibre";   // ← your home WiFi name (e.g. "SLT-XXXX")
const char* WIFI_PASS  = "Drsumi1960";   // ← your home WiFi password
const char* FB_API_KEY = "AIzaSyDUjck5P_mKVi4loUOXM6eNbXZeCg-Iezc";
const char* FB_DB_URL  = "https://bus-tracking-system-2cfc8-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* FB_EMAIL   = "bus_01@device.local";      // seeded by `npm run seed`
const char* FB_PASS    = "Dineth@2006";

// ================== limits ==================
const int      OBSTACLE_CM   = 20;    // below this distance = obstacle
const float    CRASH_G       = 2.5f;  // impact threshold (accel magnitude)
const uint32_t TELEMETRY_MS  = 250;   // telemetry tick
const uint32_t SENSOR_MS     = 50;    // sensor tick
const int      DRIVE_SPEED   = 60;    // 0..100 PWM for drive commands

// ================== pins ==================
const int IN1 = 25, IN2 = 26, ENA = 32;
const int IN3 = 27, IN4 = 14, ENB = 13;
const int TRIG = 5, ECHO = 18;
const int BUZZ = 4, RELAY = 23, LED = 19;

// ================== globals ==================
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
Adafruit_MPU6050 mpu;

String TEL_PATH, EV_PATH, CMD_PATH;

uint32_t lastTel = 0, lastSen = 0, lastEcho = 0;
float    obstacleCm = 1000.0f;
bool     obstacle = false, crash = false, held = false, motorOn = false;
bool     imuOk = false;
int      crashTicks = 0;
float    speedSmoothed = 0.0f;   // coarse dead-reckoning speed from accel (cm/s)

// ================== motor helpers ==================
void setMotors(int l, int r) {          // -100..100 per side
  ledcWrite(0, abs(l));
  ledcWrite(1, abs(r));
  digitalWrite(IN1, l > 0); digitalWrite(IN2, l < 0);
  digitalWrite(IN3, r > 0); digitalWrite(IN4, r < 0);
}
void motorsOff() { setMotors(0, 0); motorOn = false; }

// ================== sensors ==================
void ultrasonic() {
  if (millis() - lastEcho < 40) return;   // HC-SR04 needs ~30 ms per ping
  lastEcho = millis();
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);    // timeout => treat as clear
  if (us > 0) obstacleCm = us * 0.0343f;
}

void readIMU() {
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  float mag = sqrt(a.acceleration.x * a.acceleration.x +
                   a.acceleration.y * a.acceleration.y +
                   a.acceleration.z * a.acceleration.z);
  // Fault guards — the library's getEvent() ignores I2C read failures, so a
  // dead bus yields random garbage:
  //  1) >10 g is physically impossible.
  //  2) a real crash is a brief spike that decays; a reading that STAYS above
  //     the crash threshold for >2 s is a fault, not a crash.
  static uint32_t badSince = 0;
  if (mag > 10.0f * 9.807f ||
      (mag > CRASH_G * 9.807f && badSince && millis() - badSince > 2000)) {
    imuOk = false;
    Serial.println("IMU fault — disabling crash detection");
    return;
  }
  if (mag > CRASH_G * 9.807f) {
    if (!badSince) badSince = millis();
    if (!crash && ++crashTicks > 2) triggerCrash();
  } else {
    crashTicks = 0;
    badSince = 0;
  }
}

// ================== firebase helpers ==================
void triggerCrash() {
  if (crash) return;
  crash = true;
  motorsOff();
  FirebaseJson ev;
  ev.set("type", "crash");
  ev.set("value", 1);
  ev.set("ts", ".sv");
  Firebase.push(fbdo, EV_PATH.c_str(), ev);
}

void publishTelemetry() {
  if(!Firebase.ready()) return;
  FirebaseJson t;
  t.set("bus_id", BUS_ID);
  t.set("crash", crash);
  t.set("obstacle", obstacle);
  t.set("obstacle_cm", (int)obstacleCm);
  t.set("motor_enabled", motorOn);
  t.set("force_stopped", held);
  t.set("connected", true); // device-link heartbeat; web treats missing/stale as offline
  time_t now = time(nullptr);
  if (now > 1700000000) t.set("ts", (double)(now * 1000LL)); // 64-bit ms-since-1970 (long is 32-bit on ESP32)
  // location + speed are intentionally NOT written here —
  // the OpenCV tracker owns those children with the same device login.
  bool ok = Firebase.updateNode(fbdo, TEL_PATH.c_str(), t);
  // heartbeat: print on every OK/FAIL transition so the serial shows link health
  static bool lastOk = true;
  if (ok != lastOk) {
    lastOk = ok;
    if (ok) {
      Serial.println("[TEL] telemetry writes OK");
    } else {
      String err;
      Firebase.errorToString(fbdo.httpCode(), err);
      Serial.println("[TEL] telemetry write FAILED: " + err + " (http " + String(fbdo.httpCode()) + ")");
    }
  }
}

void handleCommands() {
  FirebaseJson c;
  if(!Firebase.getJSON(fbdo, CMD_PATH.c_str(), &c)) return;

  FirebaseJsonData fd, kd, cd;
  bool forceStop  = c.get(fd, "forceStop")  ? fd.to<bool>() : false;
  bool clearCrash = c.get(kd, "clearCrash") ? kd.to<bool>() : false;

  if (forceStop && !held) {
    held = true;
    motorsOff();
    digitalWrite(RELAY, LOW);      // relay module: LOW = engaged -> cuts motor rail
    digitalWrite(BUZZ, HIGH);
    Firebase.set(fbdo, TEL_PATH + "/force_stopped", true);
  } else if (!forceStop && held) {
    held = false;
    digitalWrite(RELAY, HIGH);
    digitalWrite(BUZZ, LOW);
  }

  if (clearCrash && crash) {
    crash = false;
    crashTicks = 0;
    // ack: the operator UI clears its banner when this flag goes false
    Firebase.set(fbdo, CMD_PATH + "/clearCrash", false);
  }

  // optional manual drive commands (driver page / manual mode)
  int cmd = c.get(cd, "driveCmd") ? cd.to<int>() : 0;   // 0 stop, 1 fwd, 2 back, 3 left, 4 right
  if (!held) {
    motorOn = (cmd != 0);
    switch (cmd) {
      case 1: setMotors( DRIVE_SPEED,  DRIVE_SPEED); break;
      case 2: setMotors(-DRIVE_SPEED, -DRIVE_SPEED); break;
      case 3: setMotors( 0,             DRIVE_SPEED); break;
      case 4: setMotors( DRIVE_SPEED,   0);          break;
      default: setMotors(0, 0);
    }
  }
}

// ================== WiFi setup portal (fallback when no network is reachable) ==================
// Core-libraries only (WebServer + DNSServer from the ESP32 core) — keeps flash usage low.
// Flow: bus boots -> if no reachable network, it opens the "Bus_01_Setup" hotspot.
// A phone joins it (browser auto-opens), enters the venue WiFi, the board saves it
// to its flash and reboots into it. Survives every later boot — no re-upload needed.
Preferences wifiPrefs;
WebServer portalServer;
DNSServer portalDns;

static const char PORTAL_HTML[] PROGMEM =
  "<html><head><title>Bus_01 WiFi Setup</title></head>"
  "<body style='font-family:sans-serif;max-width:380px;margin:40px auto'>"
  "<h2>Bus_01 &mdash; WiFi setup</h2>"
  "<p>Enter the network the bus should use. It is saved on the board permanently.</p>"
  "<form method='POST' action='/save'>"
  "<label>Network (SSID)<br>"
  "<input name='ssid' maxlength=63 style='width:100%;padding:8px;margin:4px 0;box-sizing:border-box'></label>"
  "<label>Password<br>"
  "<input name='pass' maxlength=63 style='width:100%;padding:8px;margin:4px 0;box-sizing:border-box'></label>"
  "<p><input type='submit' value='Connect' style='padding:10px 28px;font-size:16px'></p>"
  "</form></body></html>";

void portalHandleRoot() {
  Serial.println("*portal: GET / — serving setup page");
  portalServer.send_P(200, "text/html", PORTAL_HTML);
}

void portalHandleSave() {
  Serial.println("*portal: SAVE — ssid=" + String(portalServer.arg("ssid")));
  if (!portalServer.hasArg("ssid") || portalServer.arg("ssid").length() == 0) {
    portalHandleRoot();
    return;
  }
  wifiPrefs.begin("buswifi", false);
  wifiPrefs.putString("ssid", portalServer.arg("ssid"));
  wifiPrefs.putString("pass", portalServer.hasArg("pass") ? portalServer.arg("pass") : "");
  wifiPrefs.end();
  Serial.println("\nNew WiFi saved on board — rebooting into it");
  portalServer.send_P(200, "text/html",
                      "<html><body style='font-family:sans-serif;margin:60px'><h2>Saved. Rebooting&hellip;</h2></body></html>");
  delay(800);
  ESP.restart();
}

// Read one line from Serial with a 60-second timeout (used by the interactive prompts).
String readSerialLine() {
  String out;
  uint32_t start = millis();
  while (millis() - start < 60000) {
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n' || c == '\r') return out;
      out += c;
    }
    delay(10);
  }
  return out;
}

// Serial fallback: type "wifi" (on its own line) in the Serial Monitor (115200)
// while the board is in portal mode. The board then asks for the SSID and the
// password on separate lines — so spaces in the network name OR password are fine.
// Saves to flash and reboots. Works with no phone or browser: any laptop + Arduino IDE.
void portalCheckSerial() {
  if (!Serial.available()) return;
  String line = readSerialLine();
  line.trim();
  if (line == "wifi") {
    Serial.print("Enter SSID (press Enter; blank line cancels)> ");
    String ssid = readSerialLine();
    ssid.trim();
    if (ssid.length() == 0) { Serial.println("cancelled — no SSID entered"); return; }
    Serial.print("Enter PASSWORD (blank if the network is open)> ");
    String pass = readSerialLine();
    pass.trim();
    wifiPrefs.begin("buswifi", false);
    wifiPrefs.putString("ssid", ssid);
    wifiPrefs.putString("pass", pass);
    wifiPrefs.end();
    Serial.println("WiFi saved from serial: \"" + ssid + "\" — rebooting");
    delay(500);
    ESP.restart();
  } else if (line.length() > 0) {
    Serial.println("*portal: type 'wifi' (on its own line) to set the network");
  }
}

// Open the setup hotspot and block here until a network is saved and connected.
void startWifiPortal() {
  wifiPrefs.begin("buswifi", false);
  String s = wifiPrefs.getString("ssid", "");
  if (s.length() > 0) {
    Serial.print("\nTrying saved WiFi \"" + s + "\"");
    WiFi.begin(s.c_str(), wifiPrefs.getString("pass", "").c_str());
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) { delay(250); Serial.print("."); }
    if (WiFi.status() == WL_CONNECTED) { Serial.println(" OK (saved net)"); return; }
    Serial.println("\nSaved WiFi unreachable — opening Bus_01_Setup hotspot");
  } else {
    Serial.println("\nNo saved WiFi — opening Bus_01_Setup hotspot");
  }
  wifiPrefs.end();
  WiFi.mode(WIFI_AP);
  WiFi.softAP("Bus_01_Setup");
  portalDns.start();                            // every domain -> 192.168.4.1 (captive redirect)
  portalServer.on("/", HTTP_GET, portalHandleRoot);
  portalServer.on("/save", HTTP_POST, portalHandleSave);
  Serial.println("Portal up: join WiFi \"Bus_01_Setup\" (browser should auto-open on phones) or visit " + WiFi.softAPIP().toString());
  Serial.println("  ...or type in Serial Monitor: wifi  (then follow the prompts — spaces OK)");
  // NOTE: in AP mode WiFi.status() reports WL_CONNECTED, so it can't be the loop
  // condition. The only exits are a saved network (ESP.restart) — the web save or the serial save.
  while (true) {
    portalCheckSerial();
    portalDns.processNextRequest();
    portalServer.handleClient();
    delay(10);
  }
}

// ================== boot ==================
void setup() {
  Serial.begin(115200);
  delay(300);

  TEL_PATH = "buses/" + String(BUS_ID) + "/telemetry";
  EV_PATH  = "events/" + String(BUS_ID);
  CMD_PATH = "commands/" + String(BUS_ID);

  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(ENA, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT); pinMode(ENB, OUTPUT);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  pinMode(BUZZ, OUTPUT); pinMode(RELAY, OUTPUT); pinMode(LED, OUTPUT);
  digitalWrite(RELAY, HIGH);   // start UNengaged (motor rail powered)
  motorsOff();

  ledcAttach(ENA, 5000, 8);   // core 3.x: replaces ledcSetup + ledcAttachPin
  ledcAttach(ENB, 5000, 8);

  Serial.println("Wayline bus firmware — booting");

  // WiFi — network priority:
  //  1. compiled-in default (your home)
  //  2. network saved on the board (via the Bus_01_Setup hotspot)
  //  3. neither reachable -> open the Bus_01_Setup hotspot and wait until
  //     someone enters the new WiFi — no re-upload.
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);        // disable modem sleep: fixes TLS handshake timeouts on some routers
  WiFi.enableIPv6(false);      // force IPv4: home routers usually can't route IPv6
  if (WIFI_SSID[0] != '\0') {
    Serial.print("Connecting to WiFi \"" + String(WIFI_SSID) + "\" (compiled-in default)");
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) { delay(250); Serial.print("."); }
  }
  if (WiFi.status() != WL_CONNECTED) startWifiPortal();
  Serial.println();
  Serial.print("WiFi OK  IP: "); Serial.println(WiFi.localIP());
  Serial.print("RSSI: "); Serial.println(WiFi.RSSI());
  // internet check: resolve our own Firebase host (DNS test = real internet test)
  {
    String h = String(FB_DB_URL);
    int s = h.indexOf("//") + 2, e = h.indexOf('/', s);
    String host = (e > 0) ? h.substring(s, e) : h.substring(s);
    IPAddress fbip;
    if (WiFi.hostByName(host.c_str(), fbip)) {
      Serial.print("DNS OK  "); Serial.println(fbip);
    } else {
      Serial.println("WARNING: WiFi connected but DNS lookup FAILED — probably no internet (router/WAN)");
    }
  }

  // core 3.x removed WiFi.getTime() — start NTP explicitly (UTC) and wait briefly
  configTime(0, 0, "pool.ntp.org", "time.google.com"); // core 3.x: (gmtOffset, daylightOffset, servers)
  for (int i = 0; i < 40 && time(nullptr) < 1700000000; i++) delay(250); // up to 10 s for first fix
  Serial.print("NTP: ");
  Serial.println(time(nullptr) >= 1700000000 ? "time OK" : "not synced yet (ts appears once it syncs)");

  // MPU6050 on I2C
  imuOk = mpu.begin(MPU6050_I2CADDR_DEFAULT);
  if (imuOk) {
    Serial.println("MPU6050 OK");
  } else {
    Serial.println("MPU6050 NOT FOUND — IMU disabled (crash detection off)");
  }

  // GPS on UART2 (9600) — kept for outdoor use; arena tracking uses the camera
  Serial2.begin(9600, SERIAL_8N1, 16, 17);
  Serial2.println(F("$PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0")); // GGA + RMC only

  // Firebase: sign in as THIS bus's device account
  config.api_key = FB_API_KEY;
  config.database_url = FB_DB_URL;
  auth.user.email = FB_EMAIL;
  auth.user.password = FB_PASS;
  Firebase.reconnectNetwork(true);            // library handles Wi-Fi drops
  fbdo.setBSSLBufferSize(4096, 1024);         // BearSSL buffers (v4.4.x)
  fbdo.setResponseSize(4096);
  Firebase.begin(&config, &auth);
  Serial.print("Firebase login");
  while (!Firebase.ready()) { delay(300); Serial.print("."); }   // wait for first sign-in
  Serial.println(" OK (as " + String(FB_EMAIL) + ")");

  // immediate "alive" telemetry so the bus shows online right away
  publishTelemetry();
}

// ================== main loop ==================
void loop() {
  uint32_t now = millis();
  Firebase.ready();   // service auth/token tasks every loop

  if (now - lastSen >= SENSOR_MS) {
    lastSen = now;
    if (imuOk) readIMU();
    ultrasonic();

    bool nowObs = (obstacleCm < OBSTACLE_CM) && (obstacleCm > 0);
    if (nowObs && !obstacle) {        // rising edge -> exactly one event
      FirebaseJson ev;
      ev.set("type", "obstacle");
      ev.set("value", (int)obstacleCm);
      ev.set("ts", ".sv");
      Firebase.push(fbdo, EV_PATH.c_str(), ev);
    }
    obstacle = nowObs;
    if (obstacle) motorsOff();        // hold until the way is clear
  }

  if (now - lastTel >= TELEMETRY_MS) {
    lastTel = now;
    handleCommands();
    publishTelemetry();
    digitalWrite(LED, Firebase.ready());      // LED on = authed + link alive
  }
}
