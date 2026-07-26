// ============================================================================
// STANDALONE ESP8266 TEST — GPS or WiFi
// ============================================================================
// Uncomment ONE line below to choose what to test, then build & upload.
// No other files required. All dependencies are self-contained below.
// ============================================================================

//#define TEST_GPS
 #define TEST_WIFI

// ---------------------------------------------------------------------------
// CONFIGURATION — edit these values for your hardware / network
// ---------------------------------------------------------------------------
#ifdef TEST_GPS
  // GPS module wiring (change to match your actual pins)
  #define GPS_RX_PIN D6   // ESP8266 pin connected to GPS TX
  #define GPS_TX_PIN D7   // ESP8266 pin connected to GPS RX (often unused)
#endif

#ifdef TEST_WIFI
  // WiFi credentials
  #define WIFI_SSID "Still I Rise"
  #define WIFI_PASS "2025Mathare!"
#endif

// ---------------------------------------------------------------------------
// INCLUDES
// ---------------------------------------------------------------------------
#include <Arduino.h>

#ifdef TEST_GPS
  #include <SoftwareSerial.h>
  #include <TinyGPS++.h>
#endif

#ifdef TEST_WIFI
  #include <ESP8266WiFi.h>
#endif

// ---------------------------------------------------------------------------
// GPS TEST MODULE
// ---------------------------------------------------------------------------
#ifdef TEST_GPS

SoftwareSerial gpsSerial(GPS_RX_PIN, GPS_TX_PIN);
TinyGPSPlus gps;
unsigned long lastGpsPrint = 0;
bool uartDetected = false;
unsigned long lastReceiveTime = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }
  delay(300);

  Serial.println(F("\n============================================"));
  Serial.println(F("          GPS STANDALONE TEST"));
  Serial.println(F("============================================"));
  Serial.print(F("GPS RX pin: ")); Serial.println(GPS_RX_PIN);
  Serial.print(F("GPS TX pin: ")); Serial.println(GPS_TX_PIN);
  Serial.println(F("Initializing GPS UART @ 9600 baud..."));
  Serial.println(F("--------------------------------------------\n"));

  gpsSerial.begin(9600);
}

void loop() {
  // Feed characters to TinyGPS++
  while (gpsSerial.available()) {
    char c = gpsSerial.read();
    gps.encode(c);
    lastReceiveTime = millis();
    if (!uartDetected) {
      uartDetected = true;
      Serial.println(F("[GPS] UART communication detected."));
    }
  }

  // UART timeout warning
  if (uartDetected && (millis() - lastReceiveTime > 5000)) {
    Serial.println(F("[GPS] WARNING: No UART data for 5s. Check wiring / baud rate."));
    uartDetected = false;
  }

  // Print status every 2 seconds
  if (millis() - lastGpsPrint >= 2000) {
    lastGpsPrint = millis();

    Serial.print(F("[GPS] FIX: "));
    Serial.print(gps.location.isValid() ? F("YES") : F("NO "));

    if (gps.location.isValid()) {
      Serial.print(F(" | LAT: ")); Serial.print(gps.location.lat(), 6);
      Serial.print(F(" | LNG: ")); Serial.print(gps.location.lng(), 6);
      Serial.print(F(" | SATS: ")); Serial.print(gps.satellites.value());
      Serial.print(F(" | HDOP: ")); Serial.print(gps.hdop.value());

      if (gps.altitude.isValid()) {
        Serial.print(F(" | ALT: ")); Serial.print(gps.altitude.meters(), 1); Serial.print(F("m"));
      }
      if (gps.speed.isValid()) {
        Serial.print(F(" | SPD: ")); Serial.print(gps.speed.kmph(), 1); Serial.print(F("km/h"));
      }
      if (gps.time.isValid() && gps.date.isValid()) {
        Serial.printf(" | %02d:%02d:%02d %02d/%02d/%04d",
                      gps.time.hour(), gps.time.minute(), gps.time.second(),
                      gps.date.day(), gps.date.month(), gps.date.year());
      }
    } else {
      Serial.print(F(" | (waiting for satellite fix — move antenna outdoors)"));
      if (uartDetected) {
        Serial.print(F(" | charsProcessed=")); Serial.print(gps.charsProcessed());
      }
    }
    Serial.println();
  }
}

#endif  // TEST_GPS

// ---------------------------------------------------------------------------
// WIFI TEST MODULE
// ---------------------------------------------------------------------------
#ifdef TEST_WIFI

unsigned long wifiPrintInterval = 1000;
unsigned long lastWifiPrint = 0;
unsigned long connectStartMs = 0;
bool wasConnected = false;

enum class WifiState { OFF, CONNECTING, CONNECTED };
WifiState wifiState = WifiState::OFF;

void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }
  delay(300);

  Serial.println(F("\n============================================"));
  Serial.println(F("          WIFI STANDALONE TEST"));
  Serial.println(F("============================================"));
  Serial.print(F("SSID: ")); Serial.println(WIFI_SSID);
  Serial.println(F("Putting radio to sleep, then waking & connecting..."));
  Serial.println(F("--------------------------------------------\n"));

  // Start from a clean, fully-off state
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  WiFi.forceSleepBegin();
  delay(1);

  // Wake and connect
  WiFi.forceSleepWake();
  delay(1);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  connectStartMs = millis();
  wifiState = WifiState::CONNECTING;
}

void loop() {
  // State machine
  if (wifiState == WifiState::CONNECTING) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiState = WifiState::CONNECTED;
      wasConnected = false;  // trigger the "just connected" print
    } else if (millis() - connectStartMs >= 20000) {
      Serial.println(F("[WiFi] Connection timed out (20s). Sleeping radio."));
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      WiFi.forceSleepBegin();
      delay(1);
      wifiState = WifiState::OFF;
    }
  }

  // Print status every second
  if (millis() - lastWifiPrint >= wifiPrintInterval) {
    lastWifiPrint = millis();

    switch (wifiState) {
      case WifiState::CONNECTING:
        Serial.print(F("[WiFi] CONNECTING... elapsed="));
        Serial.print((millis() - connectStartMs) / 1000);
        Serial.println(F("s"));
        break;

      case WifiState::CONNECTED: {
        if (!wasConnected) {
          wasConnected = true;
          Serial.println(F("\n>>> WiFi CONNECTED <<<"));
          Serial.print(F("  IP:      ")); Serial.println(WiFi.localIP());
          Serial.print(F("  Gateway: ")); Serial.println(WiFi.gatewayIP());
          Serial.print(F("  Subnet:  ")); Serial.println(WiFi.subnetMask());
          Serial.print(F("  DNS:     ")); Serial.println(WiFi.dnsIP());
          Serial.print(F("  RSSI:    ")); Serial.print(WiFi.RSSI()); Serial.println(F(" dBm"));
          Serial.print(F("  MAC:     ")); Serial.println(WiFi.macAddress());
          Serial.println(F("----------------------------------------\n"));
        }
        Serial.print(F("[WiFi] CONNECTED | IP: "));
        Serial.print(WiFi.localIP());
        Serial.print(F(" | RSSI: "));
        Serial.print(WiFi.RSSI());
        Serial.println(F(" dBm"));
        break;
      }

      case WifiState::OFF:
        Serial.println(F("[WiFi] OFF / SLEEPING"));
        // Auto-retry every 10 seconds
        static unsigned long lastRetry = 0;
        if (millis() - lastRetry >= 10000) {
          lastRetry = millis();
          Serial.println(F("[WiFi] Retrying connection..."));
          WiFi.forceSleepWake();
          delay(1);
          WiFi.mode(WIFI_STA);
          WiFi.begin(WIFI_SSID, WIFI_PASS);
          connectStartMs = millis();
          wifiState = WifiState::CONNECTING;
        }
        break;
    }
  }
}

#endif  // TEST_WIFI