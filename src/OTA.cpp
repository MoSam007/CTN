#include "OTA.h"
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Updater.h>
#include <LittleFS.h>
#include "Config.h"
#include "Storage.h"
#include "WiFiManager.h"
#include "Telegram.h"
#include "Utilities.h"

//----------------------------------------------------
// Storage Paths
//----------------------------------------------------
#define OTA_CONFIG_FILE "/ota_config.json"
#define OTA_STATUS_FILE "/ota_status.json"
#define ROLLBACK_VERSION_FILE "/ota_rollback_version.txt"

//----------------------------------------------------
// State Variables
//----------------------------------------------------
static OTAConfig otaConfig;
static OTAStatus otaStatus;
static OTAProgressCallback otaCallback = nullptr;
static unsigned long lastVersionCheck = 0;
static bool otaInitialised = false;

// Forward declarations
static bool isVersionNewer(const String& newVersion, const String& currentVersion);
static void parseVersion(const String& version, int* parts);

//----------------------------------------------------
// Initialisation
//----------------------------------------------------
void initialiseOTA() {
    Serial.println("Initialising OTA Module...");
    
    // Load configuration from storage
    if (!loadOTAConfig(otaConfig)) {
        // Use defaults and save
        saveOTAConfig(otaConfig);
    }
    
    // Load current version
    otaStatus.currentVersion = FW_VERSION;
    if (otaConfig.currentVersion.length() > 0) {
        otaStatus.currentVersion = otaConfig.currentVersion;
    }
    
    // Check if rollback is available
    File rollbackFile = LittleFS.open(ROLLBACK_VERSION_FILE, "r");
    if (rollbackFile) {
        otaStatus.rollbackAvailable = true;
        rollbackFile.close();
    }
    
    otaInitialised = true;
    Serial.println("OTA Module Initialised");
    printOTAStatus();
}

void serviceOTA() {
    if (!otaInitialised || !otaConfig.enabled) return;
    
    // Auto-check for updates
    if (otaConfig.autoCheck && wifiConnected()) {
        unsigned long now = millis();
        if (lastVersionCheck == 0 || (now - lastVersionCheck >= otaConfig.checkInterval * 3600000UL)) {
            checkForUpdate();
            lastVersionCheck = now;
        }
    }
    
    // Handle ongoing OTA state
    switch (otaStatus.state) {
        case OTA_DOWNLOADING:
            // Progress handled in download callback
            break;
        case OTA_FAILED:
            // Could trigger alert here
            break;
        default:
            break;
    }
}

//----------------------------------------------------
// Version Checking
//----------------------------------------------------
bool checkForUpdate() {
    if (!wifiConnected()) {
        otaStatus.state = OTA_FAILED;
        otaStatus.errorMessage = "WiFi not connected";
        return false;
    }
    
    otaStatus.state = OTA_CHECKING_VERSION;
    if (otaCallback) otaCallback(0, "Checking for updates...");
    
    String availableVersion, downloadUrl, releaseNotes;
    bool result = checkForUpdateWithResult(availableVersion, downloadUrl, releaseNotes);
    
    if (result && availableVersion != otaStatus.currentVersion) {
        otaStatus.availableVersion = availableVersion;
        otaStatus.state = OTA_IDLE;
        if (otaCallback) otaCallback(0, "Update available: " + availableVersion);
        
        // Auto-update if enabled
        if (otaConfig.autoUpdate) {
            startOTAUpdateFromUrl(downloadUrl);
        }
        
        // Send alert
        sendFirmwareUpdateAlert(availableVersion, false);
        
        return true;
    }
    
    otaStatus.state = OTA_IDLE;
    return false;
}

bool checkForUpdateWithResult(String& availableVersion, String& downloadUrl, String& releaseNotes) {
    if (!wifiConnected()) return false;
    
    WiFiClientSecure client;
    client.setInsecure(); // For testing - use proper cert validation in production
    
    HTTPClient http;
    String url = otaConfig.serverUrl + otaConfig.versionEndpoint;
    
    if (http.begin(client, url)) {
        int httpCode = http.GET();
        if (httpCode == HTTP_CODE_OK) {
            String payload = http.getString();
            DynamicJsonDocument doc(2048);
            DeserializationError err = deserializeJson(doc, payload);
            http.end();
            
            if (!err) {
                availableVersion = doc["version"] | "";
                downloadUrl = doc["download_url"] | "";
                releaseNotes = doc["release_notes"] | "";
                
                // Verify version is newer
                if (isVersionNewer(availableVersion, otaStatus.currentVersion)) {
                    return true;
                }
            }
        } else {
            http.end();
        }
    }
    
    return false;
}

bool isVersionNewer(const String& newVersion, const String& currentVersion) {
    // Simple version comparison: major.minor.patch
    int newParts[3] = {0, 0, 0};
    int curParts[3] = {0, 0, 0};
    
    parseVersion(newVersion, newParts);
    parseVersion(currentVersion, curParts);
    
    for (int i = 0; i < 3; i++) {
        if (newParts[i] > curParts[i]) return true;
        if (newParts[i] < curParts[i]) return false;
    }
    return false;
}

void parseVersion(const String& version, int* parts) {
    int part = 0;
    String current = "";
    for (size_t i = 0; i <= version.length(); i++) {
        char c = (i < version.length()) ? version[i] : '.';
        if (c == '.') {
            if (part < 3) {
                parts[part++] = current.toInt();
                current = "";
            }
        } else {
            current += c;
        }
    }
}

String getCurrentVersion() {
    return otaStatus.currentVersion;
}

void setCurrentVersion(const String& version) {
    otaStatus.currentVersion = version;
    otaConfig.currentVersion = version;
    saveOTAConfig(otaConfig);
}

//----------------------------------------------------
// Update Process
//----------------------------------------------------
bool startOTAUpdate() {
    String availableVersion, downloadUrl, releaseNotes;
    if (!checkForUpdateWithResult(availableVersion, downloadUrl, releaseNotes)) {
        return false;
    }
    return startOTAUpdateFromUrl(downloadUrl);
}

bool startOTAUpdateFromUrl(const String& url) {
    if (!wifiConnected()) {
        otaStatus.errorMessage = "WiFi not connected";
        otaStatus.state = OTA_FAILED;
        return false;
    }
    
    otaStatus.state = OTA_DOWNLOADING;
    otaStatus.progress = 0;
    otaStatus.bytesWritten = 0;
    otaStatus.totalBytes = 0;
    otaStatus.startTime = millis();
    otaStatus.errorMessage = "";
    
    if (otaCallback) otaCallback(0, "Starting download...");
    
    WiFiClientSecure client;
    client.setInsecure();
    
    HTTPClient http;
    if (!http.begin(client, url)) {
        otaStatus.errorMessage = "Failed to connect to server";
        otaStatus.state = OTA_FAILED;
        return false;
    }
    
    int httpCode = http.GET();
    if (httpCode != HTTP_CODE_OK) {
        otaStatus.errorMessage = "HTTP error: " + String(httpCode);
        otaStatus.state = OTA_FAILED;
        http.end();
        return false;
    }
    
    otaStatus.totalBytes = http.getSize();
    
    // Save current version for potential rollback
    File rollbackFile = LittleFS.open(ROLLBACK_VERSION_FILE, "w");
    if (rollbackFile) {
        rollbackFile.print(otaStatus.currentVersion);
        rollbackFile.close();
        otaStatus.rollbackAvailable = true;
    }
    
    // Start OTA update
    if (!Update.begin(otaStatus.totalBytes)) {
        otaStatus.errorMessage = "Update.begin() failed: " + String(Update.getError());
        otaStatus.state = OTA_FAILED;
        http.end();
        return false;
    }
    
    // Download and write firmware
    WiFiClient* stream = http.getStreamPtr();
    uint8_t buffer[1024];
    size_t written = 0;
    
    while (http.connected() && (written < otaStatus.totalBytes || otaStatus.totalBytes == 0)) {
        size_t available = stream->available();
        if (available) {
            size_t read = stream->readBytes(buffer, (available < sizeof(buffer)) ? available : sizeof(buffer));
            if (read > 0) {
                size_t writtenNow = Update.write(buffer, read);
                if (writtenNow != read) {
                    otaStatus.errorMessage = "Write failed: " + String(Update.getError());
                    Update.end(false);
                    otaStatus.state = OTA_FAILED;
                    http.end();
                    return false;
                }
                written += writtenNow;
                otaStatus.bytesWritten = written;
                otaStatus.progress = (otaStatus.totalBytes > 0) ? (100.0 * written / otaStatus.totalBytes) : 0;
                
                if (otaCallback) {
                    otaCallback(otaStatus.progress, "Downloading: " + String(otaStatus.progress, 1) + "%");
                }
            }
        } else {
            delay(1);
        }
    }
    
    http.end();
    
    if (written != otaStatus.totalBytes && otaStatus.totalBytes > 0) {
        otaStatus.errorMessage = "Incomplete download: " + String(written) + "/" + String(otaStatus.totalBytes);
        Update.end(false);
        otaStatus.state = OTA_FAILED;
        return false;
    }
    
    // Verify and apply
    otaStatus.state = OTA_VERIFYING;
    if (otaCallback) otaCallback(99, "Verifying...");
    
    if (!Update.end(true)) {
        otaStatus.errorMessage = "Update.end() failed: " + String(Update.getError());
        otaStatus.state = OTA_FAILED;
        
        // Attempt rollback
        if (otaConfig.rollbackEnabled) {
            rollbackToPrevious();
        }
        return false;
    }
    
    // Success!
    otaStatus.state = OTA_SUCCESS;
    otaStatus.progress = 100;
    otaStatus.currentVersion = otaStatus.availableVersion;
    otaConfig.currentVersion = otaStatus.availableVersion;
    saveOTAConfig(otaConfig);
    
    if (otaCallback) otaCallback(100, "Update complete! Restarting...");
    
    // Send success alert
    sendFirmwareUpdateAlert(otaStatus.currentVersion, true);
    
    // Restart device
    delay(1000);
    ESP.restart();
    
    return true;
}

void cancelOTAUpdate() {
    if (otaStatus.state == OTA_DOWNLOADING || otaStatus.state == OTA_VERIFYING) {
        Update.end(false);
        otaStatus.state = OTA_IDLE;
        otaStatus.errorMessage = "Cancelled by user";
        if (otaCallback) otaCallback(0, "Cancelled");
    }
}

//----------------------------------------------------
// Progress Callback
//----------------------------------------------------
void setOTAProgressCallback(OTAProgressCallback callback) {
    otaCallback = callback;
}

//----------------------------------------------------
// Status & Configuration
//----------------------------------------------------
OTAStatus getOTAStatus() {
    return otaStatus;
}

OTAConfig getOTAConfig() {
    return otaConfig;
}

bool loadOTAConfig(OTAConfig& config) {
    if (!LittleFS.exists(OTA_CONFIG_FILE)) return false;
    
    File file = LittleFS.open(OTA_CONFIG_FILE, "r");
    if (!file) return false;
    
    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, file);
    file.close();
    
    if (err) return false;
    
    config.enabled = doc["enabled"] | true;
    config.autoCheck = doc["autoCheck"] | true;
    config.autoUpdate = doc["autoUpdate"] | false;
    config.serverUrl = doc["serverUrl"] | "https://ota.example.com";
    config.versionEndpoint = doc["versionEndpoint"] | "/api/v1/firmware/latest";
    config.firmwareEndpoint = doc["firmwareEndpoint"] | "/api/v1/firmware/download";
    config.currentVersion = doc["currentVersion"] | FW_VERSION;
    config.checkInterval = doc["checkInterval"] | 24;
    config.maxRetries = doc["maxRetries"] | 3;
    config.retryInterval = doc["retryInterval"] | 30000;
    config.verifySignature = doc["verifySignature"] | false;
    config.publicKey = doc["publicKey"] | "";
    config.rollbackEnabled = doc["rollbackEnabled"] | true;
    
    return true;
}

bool saveOTAConfig(const OTAConfig& config) {
    DynamicJsonDocument doc(2048);
    doc["enabled"] = config.enabled;
    doc["autoCheck"] = config.autoCheck;
    doc["autoUpdate"] = config.autoUpdate;
    doc["serverUrl"] = config.serverUrl;
    doc["versionEndpoint"] = config.versionEndpoint;
    doc["firmwareEndpoint"] = config.firmwareEndpoint;
    doc["currentVersion"] = config.currentVersion;
    doc["checkInterval"] = config.checkInterval;
    doc["maxRetries"] = config.maxRetries;
    doc["retryInterval"] = config.retryInterval;
    doc["verifySignature"] = config.verifySignature;
    doc["publicKey"] = config.publicKey;
    doc["rollbackEnabled"] = config.rollbackEnabled;
    
    File file = LittleFS.open(OTA_CONFIG_FILE, "w");
    if (!file) return false;
    
    serializeJson(doc, file);
    file.close();
    return true;
}

//----------------------------------------------------
// Rollback
//----------------------------------------------------
bool rollbackToPrevious() {
    otaStatus.state = OTA_ROLLBACK;
    if (otaCallback) otaCallback(0, "Rolling back...");
    
    File rollbackFile = LittleFS.open(ROLLBACK_VERSION_FILE, "r");
    if (!rollbackFile) {
        otaStatus.errorMessage = "No rollback version available";
        otaStatus.state = OTA_FAILED;
        return false;
    }
    
    String rollbackVersion = rollbackFile.readString();
    rollbackFile.close();
    rollbackVersion.trim();
    
    // In a full implementation, this would download and flash the previous version
    // For now, we just mark it as needing manual intervention
    otaStatus.errorMessage = "Rollback to v" + rollbackVersion + " requires manual flash";
    otaStatus.state = OTA_FAILED;
    
    return false;
}

bool hasRollbackAvailable() {
    return otaStatus.rollbackAvailable;
}

//----------------------------------------------------
// Server Communication
//----------------------------------------------------
bool sendOTAStatusToServer(const String& status, const String& version, float progress) {
    if (!wifiConnected() || !telegramConfigured()) return false;

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    String url = otaConfig.serverUrl + "/api/v1/devices/status";

    if (http.begin(client, url)) {
        http.addHeader("Content-Type", "application/json");

        JsonDocument doc;
        doc["device_id"] = DEVICE_NAME;
        doc["status"] = status;
        doc["version"] = version;
        doc["progress"] = progress;
        doc["timestamp"] = millis();

        String payload;
        serializeJson(doc, payload);

        int httpCode = http.POST(payload);
        http.end();
        return httpCode == HTTP_CODE_OK;
    }

    return false;
}

bool registerDeviceWithOTAServer() {
    if (!wifiConnected()) return false;
    
    WiFiClientSecure client;
    client.setInsecure();
    
    HTTPClient http;
    String url = otaConfig.serverUrl + "/api/v1/devices/register";
    
    if (http.begin(client, url)) {
        http.addHeader("Content-Type", "application/json");

        JsonDocument doc;
        doc["device_id"] = DEVICE_NAME;
        doc["model"] = "CTN-NodeMCU";
        doc["version"] = otaStatus.currentVersion;
        doc["mac"] = getMACAddress();

        String payload;
        serializeJson(doc, payload);
        
        int httpCode = http.POST(payload);
        http.end();
        return httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED;
    }
    
    return false;
}

//----------------------------------------------------
// Utilities
//----------------------------------------------------
void printOTAStatus() {
    Serial.println("=== OTA STATUS ===");
    Serial.print("Current Version: "); Serial.println(otaStatus.currentVersion);
    Serial.print("Available Version: "); Serial.println(otaStatus.availableVersion);
    Serial.print("State: "); 
    switch (otaStatus.state) {
        case OTA_IDLE: Serial.println("Idle"); break;
        case OTA_CHECKING_VERSION: Serial.println("Checking Version"); break;
        case OTA_DOWNLOADING: Serial.println("Downloading"); break;
        case OTA_VERIFYING: Serial.println("Verifying"); break;
        case OTA_APPLYING: Serial.println("Applying"); break;
        case OTA_SUCCESS: Serial.println("Success"); break;
        case OTA_FAILED: Serial.println("Failed"); break;
        case OTA_ROLLBACK: Serial.println("Rollback"); break;
    }
    Serial.print("Progress: "); Serial.print(otaStatus.progress); Serial.println("%");
    Serial.print("Rollback Available: "); Serial.println(otaStatus.rollbackAvailable ? "Yes" : "No");
    if (otaStatus.errorMessage.length() > 0) {
        Serial.print("Error: "); Serial.println(otaStatus.errorMessage);
    }
    Serial.print("Auto Check: "); Serial.println(otaConfig.autoCheck ? "Enabled" : "Disabled");
    Serial.print("Auto Update: "); Serial.println(otaConfig.autoUpdate ? "Enabled" : "Disabled");
    Serial.println("==================");
}
