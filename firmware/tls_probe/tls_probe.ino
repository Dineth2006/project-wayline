/*
 * TLS probe — Wayline bus
 * Purpose: test TLS from the ESP32 to the Firebase RTDB host using the
 * CORE's SSL client (WiFiClientSecure), independent of the Firebase
 * library's bundled client. One flash, one monitor session.
 *
 * Monitor at 115200. Expected on success:
 *   IP: ...
 *   Resolved: <ip>
 *   [RTDB] TLS OK in <n> ms
 *   [RTDB] HTTP 400/401 line        (any HTTP line = TLS + RTDB host OK)
 *   [AUTH] TLS OK in <n> ms
 *
 * If [RTDB] connect fails but [AUTH] succeeds  -> network is fine,
 * the Firebase library's bundled SSL client is the problem.
 * If BOTH fail                                 -> network/ISP/DNS problem.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>

const char* WIFI_SSID = "SLT_Fibre";
const char* WIFI_PASS = "Drsumi1960";

const char* RTDB_HOST =
    "bus-tracking-system-2cfc8-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* AUTH_HOST = "identitytoolkit.googleapis.com";

void probe(const char* tag, const char* host)
{
  IPAddress ip;
  Serial.print(F("[")); Serial.print(tag);
  Serial.print(F("] DNS "));
  if (WiFi.hostByName(host, ip))
    Serial.print(ip);
  else
    Serial.print(F("FAILED"));
  Serial.println(F("  (port 443)"));

  WiFiClientSecure c;
  c.setInsecure();          // cert validation off — this is a reachability probe
  c.setHandshakeTimeout(30); // 30 s max for the TLS handshake

  Serial.print(F("[")); Serial.print(tag);
  Serial.print(F("] connecting TLS to ")); Serial.print(host);
  Serial.print(F(" ... "));

  unsigned long t0 = millis();
  if (!c.connect(host, 443))
  {
    Serial.printf("FAILED after %lu ms\n", millis() - t0);
    return;
  }
  Serial.printf("OK in %lu ms\n", millis() - t0);

  // Minimal HTTP request — any response proves the full stack works.
  String req = String("GET / HTTP/1.1\r\nHost: ") + host +
               "\r\nConnection: close\r\n\r\n";
  c.print(req);
  delay(1500);

  String line;
  while (c.available() && !line.startsWith("HTTP/"))
    line = c.readStringUntil('\n');
  if (line.length())
  {
    Serial.print(F("[")); Serial.print(tag);
    Serial.print(F("] ")); Serial.println(line.c_str());
  }
  else
    Serial.println(F("no HTTP reply (TLS fine, host silent)"));
  c.stop();
}

void setup()
{
  Serial.begin(115200);
  while (!Serial) delay(10);
  Serial.println(F("\n=== Wayline TLS probe ==="));

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.enableIPv6(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000)
  {
    delay(400); Serial.print(F("."));
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println(F("WiFi FAIL — aborting"));
    return;
  }
  Serial.print(F("WiFi OK  IP: ")); Serial.println(WiFi.localIP());

  probe("RTDB", RTDB_HOST);
  delay(2000);
  probe("AUTH", AUTH_HOST);

  Serial.println(F("probe done — leaving USB unplugged is fine"));
}

void loop()
{
  delay(1000);
}
