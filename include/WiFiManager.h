#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <Arduino.h>
#include "Storage.h"

/*************************************************
 * WiFi Manager - Commercial Grade IoT WiFi Management
 * Multi-network, auto-reconnect, AP fallback, background scanning
 *************************************************/

//----------------------------------------------------
// WiFi Manager State Machine
//----------------------------------------------------
enum WiFiManagerState {
    WIFI_STATE_INIT,              // Initialising
    WIFI_STATE_SCANNING,          // Scanning for networks
    WIFI_STATE_CONNECTING,        // Attempting connection
    WIFI_STATE_CONNECTED,         // Connected to WiFi
    WIFI_STATE_AP_FALLBACK,       // AP mode active (configuration portal)
    WIFI_STATE_RECONNECTING,      // Lost connection, trying to reconnect
    WIFI_STATE_FAILED             // All networks failed
};

//----------------------------------------------------
// Connection Result Codes
//----------------------------------------------------
enum WiFiConnectResult {
    WIFI_CONNECT_SUCCESS = 0,
    WIFI_CONNECT_WRONG_PASSWORD = -1,
    WIFI_CONNECT_NOT_FOUND = -2,
    WIFI_CONNECT_TIMEOUT_ERR = -3,
    WIFI_CONNECT_NO_NETWORKS = -4,
    WIFI_CONNECT_FAILED = -5
};

//----------------------------------------------------
// Initialisation
//----------------------------------------------------
void initialiseWiFi();
void serviceWiFi();

//----------------------------------------------------
// Status & Info
//----------------------------------------------------
bool wifiConnected();
bool wifiIsAPMode();
bool wifiIsConnecting();

String getIPAddress();
String getSSID();
int getRSSI();
uint8_t getChannel();
String getMACAddress();

WiFiManagerState getWiFiState();
String getWiFiStateString();

void printWiFiStatus();

//----------------------------------------------------
// Network Management (uses Storage)
//----------------------------------------------------
bool loadSavedNetworks();
bool connectToBestNetwork();      // Try all saved networks by priority
bool connectToNetwork(const String& ssid, const String& password, uint16_t timeout = 15000);
int connectToNetworkWithResult(const String& ssid, const String& password, uint16_t timeout = 15000);

//----------------------------------------------------
// AP Fallback Mode
//----------------------------------------------------
bool startAPMode(const char* apSSID = "CTN-Setup", const char* apPass = "childtracker");
void stopAPMode();
bool isAPModeActive();

//----------------------------------------------------
// Background Scanning
//----------------------------------------------------
void enableBackgroundScan(bool enable);
bool isBackgroundScanEnabled();
void triggerBackgroundScan();     // Force immediate scan
int getLastScanResultCount();
String getScannedNetworkSSID(int index);
int getScannedNetworkRSSI(int index);
bool getScannedNetworkSecure(int index);

//----------------------------------------------------
// Connection Diagnostics
//----------------------------------------------------
String getConnectionDiagostics();
bool checkInternetConnectivity();
unsigned long getUptimeInCurrentState();

//----------------------------------------------------
// Error Strings
//----------------------------------------------------
String getWiFiErrorString(int code);

#endif // WIFI_MANAGER_H
