#include "APDashboard.h"
#include "Config.h"
#include "WebDashboard.h"
#include "WiFiManager.h"

/*************************************************
 * AP Dashboard - Thin wrapper for AP mode init
 * The actual web server runs from WebDashboard.cpp
 *************************************************/

static bool apDashboardActive = false;

bool startAPDashboard(const char* apSSID, const char* apPass) {
    if (apDashboardActive) {
        Serial.println("[AP Dashboard] Already active");
        return true;
    }

    Serial.println();
    Serial.println("====================================");
    Serial.println(" Starting AP Dashboard");
    Serial.println("====================================");
    Serial.print("SSID: "); Serial.println(apSSID);
    Serial.print("Password: "); Serial.println(apPass);
    Serial.print("URL: http://"); Serial.println(AP_IP);

    bool result = startAPMode(apSSID, apPass);

    if (result) {
        apDashboardActive = true;
        Serial.println();
        Serial.println("AP Dashboard Active!");
        Serial.print("Connect to WiFi: "); Serial.println(apSSID);
        Serial.print("Open browser to: http://"); Serial.println(AP_IP);
    } else {
        Serial.println("Failed to start AP Dashboard!");
    }

    return result;
}

void stopAPDashboard() {
    if (!apDashboardActive) return;

    Serial.println("Stopping AP Dashboard...");
    stopAPMode();
    apDashboardActive = false;
}

bool isAPDashboardActive() {
    return apDashboardActive;
}

String getAPDashboardURL() {
    if (!apDashboardActive) return "";
    return String("http://") + AP_IP.toString();
}

String getAPDashboardIP() {
    if (!apDashboardActive) return "";
    return AP_IP.toString();
}