#ifndef STORAGE_H
#define STORAGE_H

#include <Arduino.h>
#include <ArduinoJson.h>

/*************************************************
 * Storage Module - LittleFS JSON Persistence
 * Single source of truth for all device configuration
 *************************************************/

//----------------------------------------------------
// Storage Paths
//----------------------------------------------------
#define STORAGE_WIFI_FILE        "/wifi_credentials.json"
#define STORAGE_TELEGRAM_FILE    "/telegram_config.json"
#define STORAGE_BEHAVIOUR_FILE   "/behaviour_profile.json"
#define STORAGE_SAFEZONES_FILE   "/safe_zones.json"
#define STORAGE_SETTINGS_FILE    "/device_settings.json"
#define STORAGE_BATTERY_FILE     "/battery_calibration.json"

//----------------------------------------------------
// Storage Limits
//----------------------------------------------------
#define MAX_WIFI_NETWORKS      10
#define MAX_SAFE_ZONES         20
#define MAX_ALERT_HISTORY      50
#define MAX_PENDING_ALERTS     20

//----------------------------------------------------
// WiFi Network Structure
//----------------------------------------------------
struct WiFiNetwork {
    String ssid;
    String password;
    uint8_t priority;        // 1 = highest priority
    bool autoConnect;        // Auto-connect at boot
    bool hidden;             // Hidden SSID
    unsigned long lastConnected; // Timestamp of last successful connection
    int failCount;           // Consecutive connection failures
    
    WiFiNetwork() : priority(255), autoConnect(true), hidden(false), 
                    lastConnected(0), failCount(0) {}
};

//----------------------------------------------------
// Telegram Configuration
//----------------------------------------------------
struct TelegramConfig {
    String botToken;
    String chatId;
    bool enabled;
    
    TelegramConfig() : enabled(false) {}
};

//----------------------------------------------------
// Safe Zone / Geofence
//----------------------------------------------------
struct SafeZone {
    double latitude;
    double longitude;
    double radius;           // meters
    String name;             // "Home", "School", etc.
    uint8_t type;            // 0=Home, 1=School, 2=Custom
    bool enabled;
    unsigned long createdAt;
    unsigned long updatedAt;
    
    SafeZone() : latitude(0), longitude(0), radius(100), type(2), 
                 enabled(true), createdAt(0), updatedAt(0) {}
};

//----------------------------------------------------
// Device Settings
//----------------------------------------------------
struct DeviceSettings {
    String deviceName;
    String fwVersion;
    String ownerName;          // Owner/Parent name
    String phoneNumber;        // Emergency contact
    String timezone;           // Timezone string (e.g., "Africa/Nairobi")
    String language;           // UI language (e.g., "en")
    String units;              // "metric" or "imperial"
    bool autoUpdate;           // Auto OTA update check
    float batteryCalibrationOffset;  // Voltage correction
    uint8_t gpsUpdateInterval;       // seconds
    uint8_t behaviourInterval;       // seconds
    uint8_t wifiScanInterval;        // minutes (background scan)
    bool autoAPFallback;             // Enable AP mode on WiFi failure
    uint16_t apFallbackTimeout;      // seconds before AP mode
    bool powerSaveMode;              // Enable power saving
    uint8_t cpuFrequency;            // 80 or 160 MHz
    bool debugMode;                  // Verbose serial output

    DeviceSettings() : deviceName("CTN-001"), fwVersion("1.0"),
                       ownerName(""), phoneNumber(""), timezone("UTC"),
                       language("en"), units("metric"), autoUpdate(false),
                       batteryCalibrationOffset(0.0), gpsUpdateInterval(1),
                       behaviourInterval(5), wifiScanInterval(60),
                       autoAPFallback(true), apFallbackTimeout(60),
                       powerSaveMode(false), cpuFrequency(160), debugMode(false) {}
};

//----------------------------------------------------
// Battery Calibration Points
//----------------------------------------------------
struct BatteryCalibration {
    float voltagePoints[11];  // 0%, 10%, 20%... 100%
    float dividerRatio;
    float adcReference;
    bool calibrated;

    BatteryCalibration() : dividerRatio(3.2), adcReference(1.0), calibrated(false) {
        // Default Li-ion curve
        voltagePoints[0] = 3.30;   // 0%
        voltagePoints[1] = 3.40;   // 10%
        voltagePoints[2] = 3.50;   // 20%
        voltagePoints[3] = 3.60;   // 30%
        voltagePoints[4] = 3.70;   // 40%
        voltagePoints[5] = 3.80;   // 50%
        voltagePoints[6] = 3.90;   // 60%
        voltagePoints[7] = 4.00;   // 70%
        voltagePoints[8] = 4.10;   // 80%
        voltagePoints[9] = 4.15;   // 90%
        voltagePoints[10] = 4.20;  // 100%
    }
};

//----------------------------------------------------
// Behaviour Profile (Learned)
//----------------------------------------------------
struct BehaviourProfile {
    double homeLat;
    double homeLon;
    double schoolLat;
    double schoolLon;
    unsigned long typicalSchoolStart;  // Minutes from midnight
    unsigned long typicalSchoolEnd;
    bool homeLearned;
    bool schoolLearned;
    unsigned long lastUpdated;
    
    BehaviourProfile() : homeLat(0), homeLon(0), schoolLat(0), schoolLon(0),
                         typicalSchoolStart(480), typicalSchoolEnd(900),  // 8:00-15:00
                         homeLearned(false), schoolLearned(false), lastUpdated(0) {}
};

//----------------------------------------------------
// Lifecycle
//----------------------------------------------------
bool initialiseStorage();
void formatStorage();  // Factory reset - erase all configs

//----------------------------------------------------
// WiFi Credentials Management
//----------------------------------------------------
bool loadWiFiNetworks(WiFiNetwork* networks, uint8_t& count, uint8_t maxCount);
bool saveWiFiNetworks(const WiFiNetwork* networks, uint8_t count);
bool addWiFiNetwork(const WiFiNetwork& network);
bool updateWiFiNetwork(const String& ssid, const WiFiNetwork& network);
bool removeWiFiNetwork(const String& ssid);
bool reorderWiFiNetworks(const String* ssidOrder, uint8_t count);
WiFiNetwork* findWiFiNetwork(const String& ssid);
uint8_t getWiFiNetworkCount();

//----------------------------------------------------
// Telegram Configuration
//----------------------------------------------------
bool loadTelegramConfig(TelegramConfig& config);
bool saveTelegramConfig(const TelegramConfig& config);

//----------------------------------------------------
// Safe Zones
//----------------------------------------------------
bool loadSafeZones(SafeZone* zones, uint8_t& count, uint8_t maxCount);
bool saveSafeZones(const SafeZone* zones, uint8_t count);
bool addSafeZone(const SafeZone& zone);
bool updateSafeZone(uint8_t index, const SafeZone& zone);
bool removeSafeZone(uint8_t index);
uint8_t getSafeZoneCount();

//----------------------------------------------------
// Device Settings
//----------------------------------------------------
bool loadDeviceSettings(DeviceSettings& settings);
bool saveDeviceSettings(const DeviceSettings& settings);

//----------------------------------------------------
// Battery Calibration
//----------------------------------------------------
bool loadBatteryCalibration(BatteryCalibration& cal);
bool saveBatteryCalibration(const BatteryCalibration& cal);

//----------------------------------------------------
// Behaviour Profile
//----------------------------------------------------
bool loadBehaviourProfile(BehaviourProfile& profile);
bool saveBehaviourProfile(const BehaviourProfile& profile);

//----------------------------------------------------
// Utility
//----------------------------------------------------
bool storageExists(const char* path);
size_t getFileSize(const char* path);
String getStorageInfo();

#endif // STORAGE_H
