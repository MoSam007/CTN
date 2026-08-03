/*
 * ============================================================
 * CTN - Child Tracking Necklace
 * Main Application
 * Production Firmware
 *
 * Target: ESP8266 NodeMCU (ESP-12E)
 * Framework: Arduino (PlatformIO)
 * ============================================================
 */

#include <Arduino.h>

#include "Config.h"
#include "Storage.h"
#include "GPS.h"
#include "WiFiManager.h"
#include "Telegram.h"
#include "Behaviour.h"
#include "Battery.h"
#include "Alerts.h"
#include "WebDashboard.h"
#include "WebSocket.h"
#include "Logger.h"
#include "OTA.h"

//--------------------------------------------------------------
// Timers
//--------------------------------------------------------------
unsigned long gpsTimer = 0;
unsigned long behaviourTimer = 0;
unsigned long statusTimer = 0;
unsigned long batteryTimer = 0;

//--------------------------------------------------------------
// Panic Button Triple-Tap Detection
//--------------------------------------------------------------
unsigned long lastPressTime = 0;
int pressCount = 0;
const unsigned long TAP_WINDOW = 1500;  // 1.5 seconds between taps
const int REQUIRED_TAPS = 3;

void checkPanicButton() {
    static bool wasPressed = false;
    bool isPressed = (digitalRead(PANIC_BUTTON_PIN) == LOW);
    unsigned long now = millis();

    if (isPressed && !wasPressed) {
        // Button just pressed
        if (now - lastPressTime > TAP_WINDOW) {
            pressCount = 1;  // First tap in new sequence
        } else {
            pressCount++;
        }
        lastPressTime = now;
        Serial.print("Panic tap #");
        Serial.println(pressCount);
    }

    // Check for triple-tap completion
    if (pressCount >= REQUIRED_TAPS && (now - lastPressTime > 200)) {
        Serial.println();
        Serial.println("*** PANIC BUTTON TRIPLE-TAP DETECTED ***");
        panicAlert();
        pressCount = 0;
    }

    // Reset if timeout
    if (pressCount > 0 && (now - lastPressTime > TAP_WINDOW)) {
        pressCount = 0;
    }

    wasPressed = isPressed;
}

//--------------------------------------------------------------
// GPS Debugging
//--------------------------------------------------------------
void printGPSDebug() {
    if (gpsHasFix()) {
        Serial.print("GPS Fix: ");
        Serial.print("Lat=");
        Serial.print(getLatitude(), 6);
        Serial.print(" Lon=");
        Serial.print(getLongitude(), 6);
        Serial.print(" Speed=");
        Serial.print(getSpeed(), 1);
        Serial.print(" km/h");
        Serial.print(" Sats=");
        Serial.print(getSatelliteCount());
        Serial.print(" HDOP=");
        Serial.print(getHDOP());
        Serial.print(" FixAge=");
        unsigned long fixAge = getGPSTimeSinceFix();
        if (fixAge != 0xFFFFFFFF) {
            Serial.print(fixAge);
        } else {
            Serial.print("N/A");
        }
        Serial.print("ms");
        Serial.print(" Maps: ");
        Serial.println(getGoogleMapsLink());
    } else {
        Serial.print("GPS: No Fix | Sats=");
        Serial.print(getSatelliteCount());
        Serial.print(" Chars=");
        Serial.print(getGPSCharsProcessed());
        Serial.print(" FailedCS=");
        Serial.println(getGPSFailedChecksum());
    }
}

void printGPSDetailedDebug() {
    static unsigned long lastDetailedDebug = 0;
    if (millis() - lastDetailedDebug >= 30000) { // Every 30 seconds
        lastDetailedDebug = millis();
        Serial.println();
        Serial.println("========== GPS DETAILED DEBUG ==========");
        printGPSDebugInfo();
        printGPSFixQuality();
        printGPSStats();
        Serial.println("========================================");
    }
}

//--------------------------------------------------------------
// SETUP
//--------------------------------------------------------------
void setup()
{
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("====================================");
    Serial.println(" Child Tracking Necklace");
    Serial.println(" Production Firmware v" FW_VERSION);
    Serial.println("====================================");

    initialiseLogger();

    pinMode(PANIC_BUTTON_PIN, INPUT_PULLUP);

    // Initialize Storage (LittleFS) first - critical for all configs
    if (!initialiseStorage()) {
        Serial.println("FATAL: Storage initialization failed!");
        while (true) delay(1000);
    }

    // Initialize Battery monitor
    initialiseBattery();

    // Initialize WiFi (loads saved networks from Storage)
    initialiseWiFi();

    // Initialize WebSocket server - DISABLED for stability
    // initWebSocket();

    // Web Dashboard starts in both STA and AP modes
    // initWebDashboard() is called by WiFiManager when connected
    // In AP mode it will be started by startAPMode()

    initialiseGPS();
    initialiseTelegram();
    initialiseBehaviour();
    initialiseAlerts();
    initialiseOTA();

    Serial.println();
    Serial.println("System Initialisation Complete.");
    Serial.println("--------------------------------");
}

//--------------------------------------------------------------
// LOOP
//--------------------------------------------------------------
void loop()
{
    serviceWiFi();
    // serviceWebSocket();  // Service WebSocket - DISABLED for stability
    updateGPS();
    checkPanicButton();
    serviceAlerts();

    if (millis() - behaviourTimer >= BEHAVIOUR_INTERVAL)
    {
        behaviourTimer = millis();
        updateBehaviour();
    }

    // Battery update every 10 seconds
    if (millis() - batteryTimer >= 10000)
    {
        batteryTimer = millis();
        updateBattery();
    }

    // Retry queued Telegram messages
    retryQueuedTelegramMessages();
    serviceOTA();

    if (millis() - statusTimer >= 10000)
    {
        statusTimer = millis();
        Serial.println();
        Serial.println("========== DEVICE STATUS ==========");
        printWiFiStatus();
        printGPSStatus();
        printBatteryStatus();
        printBehaviourStatus();
        printGPSDebug();
        printGPSDetailedDebug();  // Also check if 30s interval passed for detailed debug
        Serial.println("===================================");
    }

    serviceWebDashboard();

    // Retry queued Telegram messages when WiFi is available
    retryQueuedTelegramMessages();
}
