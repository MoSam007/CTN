#include "WiFiManager.h"
#include "Config.h"
#include "Storage.h"
#include "WebDashboard.h"

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

//----------------------------------------------------
// Internal State
//----------------------------------------------------

static WiFiNetwork savedNetworks[10];
static uint8_t savedNetworkCount = 0;
static int8_t currentNetworkIndex = -1;

static WiFiManagerState currentState = WIFI_STATE_INIT;
static unsigned long stateStartTime = 0;

static bool apModeActive = false;

static bool backgroundScanEnabled = true;
static unsigned long lastBackgroundScan = 0;
static int lastScanResultCount = 0;
static String scannedSSIDs[20];
static int scannedRSSIs[20];
static bool scannedSecure[20];

static unsigned long lastReconnectAttempt = 0;
static unsigned long lastApFallbackCheck = 0;

//----------------------------------------------------
// State Helpers
//----------------------------------------------------

static void setState(WiFiManagerState newState) {
    if (newState != currentState) {
        Serial.print("WiFi State: ");
        Serial.print(getWiFiStateString());
        Serial.print(" -> ");
        currentState = newState;
        stateStartTime = millis();
        Serial.println(getWiFiStateString());
    }
}

//----------------------------------------------------
// Load Saved Networks
//----------------------------------------------------

bool loadSavedNetworks() {
    return loadWiFiNetworks(savedNetworks, savedNetworkCount, 10);
}

//----------------------------------------------------
// Connect to Best Available Network
//----------------------------------------------------

bool connectToBestNetwork() {
    // Sort by priority (already sorted by loadWiFiNetworks)
    for (uint8_t i = 0; i < savedNetworkCount; i++) {
        if (savedNetworks[i].autoConnect && savedNetworks[i].failCount < 5) {
            currentNetworkIndex = i;
            Serial.print("Connecting to: ");
            Serial.println(savedNetworks[i].ssid);
            
            WiFi.begin(savedNetworks[i].ssid.c_str(), savedNetworks[i].password.c_str());
            return true;
        }
    }
    return false;
}

//----------------------------------------------------
// Initialise WiFi
//----------------------------------------------------

void initialiseWiFi() {
    Serial.println();
    Serial.println("====================================");
    Serial.println(" WiFi Manager Initialising");
    Serial.println("====================================");

    // Mount LittleFS and load saved networks
    if (loadSavedNetworks()) {
        Serial.print("Loaded ");
        Serial.print(savedNetworkCount);
        Serial.println(" saved network(s)");
    } else {
        Serial.println("No saved networks found");
    }

    // Set WiFi mode to AP+STA - AP always active at 192.168.4.1
    WiFi.mode(WIFI_AP_STA);
    WiFi.hostname(DEVICE_NAME);
    WiFi.setSleepMode(WIFI_NONE_SLEEP);
    WiFi.setAutoReconnect(false);

    // Start AP mode with fixed IP 192.168.4.1 - always active as primary dashboard
    WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
    bool apResult = WiFi.softAP(AP_MODE_SSID, AP_PASSWORD);
    if (apResult) {
        apModeActive = true;
        Serial.println();
        Serial.println("AP Mode Active (Primary Dashboard)");
        Serial.print("AP SSID: "); Serial.println(AP_MODE_SSID);
        Serial.print("AP IP: "); Serial.println(WiFi.softAPIP());
    } else {
        Serial.println("Failed to start AP mode!");
    }

    // Initialize web dashboard on AP IP (always available at 192.168.4.1)
    extern void initWebDashboard();
    initWebDashboard();

    // Try to connect to best network (in background, AP stays active)
    if (savedNetworkCount > 0 && connectToBestNetwork()) {
        setState(WIFI_STATE_CONNECTING);
    } else {
        // No networks saved - stay in AP mode for setup
        setState(WIFI_STATE_AP_FALLBACK);
    }
}

//----------------------------------------------------
// Main Service Loop (Non-blocking)
//----------------------------------------------------

void serviceWiFi() {
    unsigned long now = millis();

    // State machine for all modes
    switch (currentState) {
        case WIFI_STATE_INIT:
            if (savedNetworkCount > 0) connectToBestNetwork();
            break;

        case WIFI_STATE_CONNECTING: {
            if (WiFi.status() == WL_CONNECTED) {
                setState(WIFI_STATE_CONNECTED);
                Serial.println();
                Serial.println("WiFi Connected!");
                Serial.print("SSID: "); Serial.println(WiFi.SSID());
                Serial.print("IP: "); Serial.println(WiFi.localIP());
                Serial.print("RSSI: "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");
                Serial.println("AP Dashboard still active at 192.168.4.1");

                if (currentNetworkIndex >= 0 && currentNetworkIndex < savedNetworkCount) {
                    savedNetworks[currentNetworkIndex].lastConnected = now;
                    savedNetworks[currentNetworkIndex].failCount = 0;
                    saveWiFiNetworks(savedNetworks, savedNetworkCount);
                }

                lastBackgroundScan = now;
            }
            else if (now - stateStartTime > WIFI_CONNECT_TIMEOUT) {
                Serial.println();
                Serial.println("Connection timeout");
                WiFi.disconnect();

                if (currentNetworkIndex >= 0 && currentNetworkIndex < savedNetworkCount) {
                    savedNetworks[currentNetworkIndex].failCount++;
                    saveWiFiNetworks(savedNetworks, savedNetworkCount);
                }

                if (!connectToBestNetwork()) {
                    // Stay in AP mode - AP is always active anyway
                    Serial.println("All networks failed - staying in AP mode");
                    setState(WIFI_STATE_AP_FALLBACK);
                }
            }
            break;
        }

        case WIFI_STATE_CONNECTED: {
            if (WiFi.status() != WL_CONNECTED) {
                Serial.println();
                Serial.println("WiFi connection lost!");
                setState(WIFI_STATE_RECONNECTING);
                lastReconnectAttempt = now;
            }

            // Background scanning
            if (backgroundScanEnabled && now - lastBackgroundScan > WIFI_BACKGROUND_SCAN_INTERVAL) {
                lastBackgroundScan = now;
                triggerBackgroundScan();
            }

            extern void serviceWebDashboard();
            serviceWebDashboard();
            break;
        }

        case WIFI_STATE_RECONNECTING: {
            if (now - lastReconnectAttempt < WIFI_RETRY_INTERVAL) break;

            lastReconnectAttempt = now;
            Serial.println("Attempting reconnection...");

            if (currentNetworkIndex >= 0 && currentNetworkIndex < savedNetworkCount) {
                WiFi.begin(savedNetworks[currentNetworkIndex].ssid.c_str(),
                          savedNetworks[currentNetworkIndex].password.c_str());
                setState(WIFI_STATE_CONNECTING);
            } else if (!connectToBestNetwork()) {
                // Stay in AP mode - AP is always active
                setState(WIFI_STATE_AP_FALLBACK);
            }
            break;
        }

        case WIFI_STATE_FAILED: {
            if (now - stateStartTime > 60000) {
                stateStartTime = now;
                if (connectToBestNetwork()) {
                    setState(WIFI_STATE_CONNECTING);
                }
            }
            break;
        }

        case WIFI_STATE_SCANNING: {
            int n = WiFi.scanComplete();
            if (n >= 0) {
                lastScanResultCount = min(n, 20);
                for (int i = 0; i < lastScanResultCount; i++) {
                    scannedSSIDs[i] = WiFi.SSID(i);
                    scannedRSSIs[i] = WiFi.RSSI(i);
                    scannedSecure[i] = (WiFi.encryptionType(i) != ENC_TYPE_NONE);
                }
                WiFi.scanDelete();

                if (WiFi.status() == WL_CONNECTED) {
                    setState(WIFI_STATE_CONNECTED);
                } else {
                    setState(WIFI_STATE_INIT);
                }
            }
            break;
        }

        case WIFI_STATE_AP_FALLBACK: {
            // AP mode is always active, service the web dashboard
            extern void serviceWebDashboard();
            serviceWebDashboard();

            // Periodic check to retry STA if networks saved
            if (now - lastApFallbackCheck > 30000) {  // Every 30s
                lastApFallbackCheck = now;
                if (savedNetworkCount > 0) {
                    Serial.println("AP Mode: Retrying STA connection...");
                    if (connectToBestNetwork()) {
                        setState(WIFI_STATE_CONNECTING);
                    }
                }
            }
            break;
        }
    }
}

//----------------------------------------------------
// AP Fallback Mode
//----------------------------------------------------

bool startAPMode(const char* apSSID, const char* apPass) {
    if (apModeActive) return true;
    
    Serial.println();
    Serial.println("Starting AP Mode...");
    Serial.print("SSID: "); Serial.println(apSSID);
    Serial.print("IP: 192.168.4.1");
    
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAPdisconnect(true);
    delay(100);
    
    WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
    bool result = WiFi.softAP(apSSID, apPass);
    
    if (result) {
        apModeActive = true;
        setState(WIFI_STATE_AP_FALLBACK);
        
        Serial.println();
        Serial.println("AP Mode Active");
        Serial.print("AP IP: "); Serial.println(WiFi.softAPIP());
        
        extern void initWebDashboard();
        initWebDashboard();
    }
    
    return result;
}

void stopAPMode() {
    if (!apModeActive) return;
    
    Serial.println("Stopping AP Mode...");
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    apModeActive = false;
    setState(WIFI_STATE_INIT);
}

bool isAPModeActive() {
    return apModeActive;
}

//----------------------------------------------------
// Background Scanning
//----------------------------------------------------

void enableBackgroundScan(bool enable) {
    backgroundScanEnabled = enable;
    Serial.print("Background scan: "); Serial.println(enable ? "enabled" : "disabled");
}

bool isBackgroundScanEnabled() {
    return backgroundScanEnabled;
}

void triggerBackgroundScan() {
    if (currentState == WIFI_STATE_CONNECTING || currentState == WIFI_STATE_RECONNECTING) return;
    
    Serial.println("Starting background WiFi scan...");
    WiFi.scanNetworks(true);
    setState(WIFI_STATE_SCANNING);
}

int getLastScanResultCount() {
    return lastScanResultCount;
}

String getScannedNetworkSSID(int index) {
    if (index >= 0 && index < lastScanResultCount) return scannedSSIDs[index];
    return "";
}

int getScannedNetworkRSSI(int index) {
    if (index >= 0 && index < lastScanResultCount) return scannedRSSIs[index];
    return 0;
}

bool getScannedNetworkSecure(int index) {
    if (index >= 0 && index < lastScanResultCount) return scannedSecure[index];
    return false;
}

//----------------------------------------------------
// Status & Info
//----------------------------------------------------

bool wifiConnected() {
    return WiFi.status() == WL_CONNECTED && !apModeActive;
}

bool wifiIsAPMode() {
    return apModeActive;
}

bool wifiIsConnecting() {
    return currentState == WIFI_STATE_CONNECTING || currentState == WIFI_STATE_RECONNECTING;
}

String getIPAddress() {
    if (apModeActive) return WiFi.softAPIP().toString();
    if (!wifiConnected()) return "Disconnected";
    return WiFi.localIP().toString();
}

String getSSID() {
    if (apModeActive) return String(AP_MODE_SSID) + " (AP)";
    if (!wifiConnected()) return "Disconnected";
    return WiFi.SSID();
}

int getRSSI() {
    if (!wifiConnected()) return 0;
    return WiFi.RSSI();
}

uint8_t getChannel() {
    if (!wifiConnected()) return 0;
    return WiFi.channel();
}

String getMACAddress() {
    return WiFi.macAddress();
}

WiFiManagerState getWiFiState() {
    return currentState;
}

String getWiFiStateString() {
    switch (currentState) {
        case WIFI_STATE_INIT: return "INIT";
        case WIFI_STATE_SCANNING: return "SCANNING";
        case WIFI_STATE_CONNECTING: return "CONNECTING";
        case WIFI_STATE_CONNECTED: return "CONNECTED";
        case WIFI_STATE_AP_FALLBACK: return "AP_FALLBACK";
        case WIFI_STATE_RECONNECTING: return "RECONNECTING";
        case WIFI_STATE_FAILED: return "FAILED";
    }
    return "UNKNOWN";
}

unsigned long getUptimeInCurrentState() {
    return millis() - stateStartTime;
}

void printWiFiStatus() {
    Serial.println("WiFi STATUS");
    Serial.print("State: "); Serial.println(getWiFiStateString());
    Serial.print("Uptime in state: "); Serial.print(getUptimeInCurrentState() / 1000); Serial.println("s");
    
    if (apModeActive) {
        Serial.println("Mode: AP Fallback");
        Serial.print("AP SSID: "); Serial.println(AP_MODE_SSID);
        Serial.print("AP IP: "); Serial.println(WiFi.softAPIP());
        return;
    }
    
    if (!wifiConnected()) {
        Serial.println("Status: DISCONNECTED");
        Serial.print("Saved networks: "); Serial.println(savedNetworkCount);
        return;
    }
    
    Serial.println("Status: CONNECTED");
    Serial.print("SSID: "); Serial.println(getSSID());
    Serial.print("IP: "); Serial.println(getIPAddress());
    Serial.print("RSSI: "); Serial.print(getRSSI()); Serial.println(" dBm");
    Serial.print("Channel: "); Serial.println(getChannel());
    Serial.print("MAC: "); Serial.println(getMACAddress());
}

//----------------------------------------------------
// Connection Diagnostics
//----------------------------------------------------

bool checkInternetConnectivity() {
    if (!wifiConnected()) return false;
    
    WiFiClient client;
    HTTPClient http;
    http.begin(client, "http://clients3.google.com/generate_204");
    http.setTimeout(5000);
    int httpCode = http.GET();
    http.end();
    
    return httpCode == 204;
}

String getConnectionDiagostics() {
    String diag = "=== WiFi Diagnostics ===\n";
    diag += "State: " + getWiFiStateString() + "\n";
    diag += "Mode: " + String(apModeActive ? "AP" : "STA") + "\n";
    diag += "Connected: " + String(wifiConnected() ? "Yes" : "No") + "\n";

    if (wifiConnected()) {
        diag += "SSID: " + WiFi.SSID() + "\n";
        diag += "BSSID: " + WiFi.BSSIDstr() + "\n";
        diag += "IP: " + WiFi.localIP().toString() + "\n";
        diag += "Gateway: " + WiFi.gatewayIP().toString() + "\n";
        diag += "DNS: " + WiFi.dnsIP().toString() + "\n";
        diag += "Subnet: " + WiFi.subnetMask().toString() + "\n";
        diag += "RSSI: " + String(WiFi.RSSI()) + " dBm\n";
        diag += "Channel: " + String(WiFi.channel()) + "\n";
        diag += "MAC: " + WiFi.macAddress() + "\n";
        diag += "Internet: " + String(checkInternetConnectivity() ? "Yes" : "No") + "\n";
    }

    diag += "\nSaved Networks:\n";
    for (uint8_t i = 0; i < savedNetworkCount; i++) {
        diag += "  #" + String(savedNetworks[i].priority) + " " + savedNetworks[i].ssid;
        diag += " (auto:" + String(savedNetworks[i].autoConnect ? "Y" : "N") + ")";
        diag += " (fails:" + String(savedNetworks[i].failCount) + ")\n";
    }

    return diag;
}

//----------------------------------------------------
// Connect to network - bool version (for simple use)
//----------------------------------------------------
bool connectToNetwork(const String& ssid, const String& password, uint16_t timeout) {
    int result = connectToNetworkWithResult(ssid, password, timeout);
    return result == WIFI_CONNECT_SUCCESS;
}

//----------------------------------------------------
// Connect to network with detailed result code
//----------------------------------------------------
int connectToNetworkWithResult(const String& ssid, const String& password, uint16_t timeout) {
    WiFi.disconnect(true);
    delay(100);

    WiFi.begin(ssid.c_str(), password.c_str());

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - startTime > timeout) {
            WiFi.disconnect(true);
            return WIFI_CONNECT_TIMEOUT_ERR;
        }
        delay(100);
        yield();
    }

    return WIFI_CONNECT_SUCCESS;
}

//----------------------------------------------------
// Error Strings
//----------------------------------------------------
String getWiFiErrorString(int code) {
    switch (code) {
        case WIFI_CONNECT_WRONG_PASSWORD: return "Wrong password";
        case WIFI_CONNECT_NOT_FOUND: return "Network not found";
        case WIFI_CONNECT_TIMEOUT_ERR: return "Connection timeout";
        case WIFI_CONNECT_NO_NETWORKS: return "No saved networks";
        default: return "Connection failed";
    }
}
