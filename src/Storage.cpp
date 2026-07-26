#include "Storage.h"

#include <LittleFS.h>
#include <ArduinoJson.h>

//----------------------------------------------------
// Initialise LittleFS
//----------------------------------------------------
bool initialiseStorage() {
    if (!LittleFS.begin()) {
        Serial.println("ERROR: LittleFS mount failed. Formatting...");
        LittleFS.format();
        if (!LittleFS.begin()) {
            Serial.println("ERROR: LittleFS mount failed after format!");
            return false;
        }
    }

    Serial.println("LittleFS mounted successfully");

    FSInfo fs_info;
    LittleFS.info(fs_info);
    Serial.print("Total: "); Serial.print(fs_info.totalBytes); Serial.println(" bytes");
    Serial.print("Used:  "); Serial.print(fs_info.usedBytes); Serial.println(" bytes");

    // Create default configs if they don't exist
    if (!storageExists(STORAGE_WIFI_FILE)) {
        WiFiNetwork defaultNetworks[MAX_WIFI_NETWORKS];
        uint8_t count = 0;
        saveWiFiNetworks(defaultNetworks, count);
    }

    if (!storageExists(STORAGE_TELEGRAM_FILE)) {
        TelegramConfig cfg;
#ifdef TELEGRAM_BOT_TOKEN
        cfg.botToken = TELEGRAM_BOT_TOKEN;
        Serial.printf("Loaded Telegram bot token from build config: %s\n", TELEGRAM_BOT_TOKEN);
#endif
#ifdef TELEGRAM_CHAT_ID
        cfg.chatId = TELEGRAM_CHAT_ID;
        Serial.printf("Loaded Telegram chat ID from build config: %s\n", TELEGRAM_CHAT_ID);
#endif
        cfg.enabled = true;
        saveTelegramConfig(cfg);
        Serial.println("Created default Telegram config");
    }

    if (!storageExists(STORAGE_SAFEZONES_FILE)) {
        SafeZone zones[MAX_SAFE_ZONES];
        uint8_t count = 0;
        saveSafeZones(zones, count);
    }

    if (!storageExists(STORAGE_SETTINGS_FILE)) {
        DeviceSettings settings;
        saveDeviceSettings(settings);
    }

    if (!storageExists(STORAGE_BATTERY_FILE)) {
        BatteryCalibration cal;
        saveBatteryCalibration(cal);
    }

    if (!storageExists(STORAGE_BEHAVIOUR_FILE)) {
        BehaviourProfile profile;
        saveBehaviourProfile(profile);
    }

    return true;
}

//----------------------------------------------------
// Factory Reset - Erase All Configs
//----------------------------------------------------
void formatStorage() {
    Serial.println("Formatting LittleFS - Factory Reset");
    LittleFS.format();
    initialiseStorage();  // Recreate defaults
}

//----------------------------------------------------
// Helper: Read JSON File
//----------------------------------------------------
static bool readJsonFile(const char* path, JsonDocument& doc) {
    if (!LittleFS.exists(path)) return false;
    
    File file = LittleFS.open(path, "r");
    if (!file) return false;
    
    DeserializationError err = deserializeJson(doc, file);
    file.close();
    
    return err == DeserializationError::Ok;
}

//----------------------------------------------------
// Helper: Write JSON File
//----------------------------------------------------
static bool writeJsonFile(const char* path, const JsonDocument& doc) {
    File file = LittleFS.open(path, "w");
    if (!file) return false;
    
    serializeJson(doc, file);
    file.close();
    return true;
}

//======================================================================
// WiFi NETWORKS
//======================================================================

bool loadWiFiNetworks(WiFiNetwork* networks, uint8_t& count, uint8_t maxCount) {
    JsonDocument doc;
    if (!readJsonFile(STORAGE_WIFI_FILE, doc)) {
        count = 0;
        return true;
    }
    
    JsonArray arr = doc.as<JsonArray>();
    count = min<uint8_t>(arr.size(), maxCount);
    
    for (uint8_t i = 0; i < count; i++) {
        JsonObject obj = arr[i];
        networks[i].ssid = obj["ssid"].as<String>();
        networks[i].password = obj["password"].as<String>();
        networks[i].priority = obj["priority"] | 255;
        networks[i].autoConnect = obj["autoConnect"] | true;
        networks[i].hidden = obj["hidden"] | false;
        networks[i].lastConnected = obj["lastConnected"] | 0UL;
        networks[i].failCount = obj["failCount"] | 0;
    }
    
    // Sort by priority (ascending - 1 is highest)
    for (uint8_t i = 0; i < count - 1; i++) {
        for (uint8_t j = i + 1; j < count; j++) {
            if (networks[i].priority > networks[j].priority) {
                WiFiNetwork temp = networks[i];
                networks[i] = networks[j];
                networks[j] = temp;
            }
        }
    }
    
    return true;
}

bool saveWiFiNetworks(const WiFiNetwork* networks, uint8_t count) {
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    
    for (uint8_t i = 0; i < count; i++) {
        JsonObject obj = arr.add<JsonObject>();
        obj["ssid"] = networks[i].ssid;
        obj["password"] = networks[i].password;
        obj["priority"] = networks[i].priority;
        obj["autoConnect"] = networks[i].autoConnect;
        obj["hidden"] = networks[i].hidden;
        obj["lastConnected"] = networks[i].lastConnected;
        obj["failCount"] = networks[i].failCount;
    }
    
    return writeJsonFile(STORAGE_WIFI_FILE, doc);
}

bool addWiFiNetwork(const WiFiNetwork& network) {
    WiFiNetwork networks[MAX_WIFI_NETWORKS];
    uint8_t count = 0;
    
    if (!loadWiFiNetworks(networks, count, MAX_WIFI_NETWORKS)) return false;
    
    // Check if already exists
    for (uint8_t i = 0; i < count; i++) {
        if (networks[i].ssid == network.ssid) {
            return updateWiFiNetwork(network.ssid, network);
        }
    }
    
    if (count >= MAX_WIFI_NETWORKS) return false;
    
    networks[count] = network;
    // Assign priority if not set
    if (networks[count].priority == 255) {
        networks[count].priority = count + 1;
    }
    count++;
    
    return saveWiFiNetworks(networks, count);
}

bool updateWiFiNetwork(const String& ssid, const WiFiNetwork& network) {
    WiFiNetwork networks[MAX_WIFI_NETWORKS];
    uint8_t count = 0;
    
    if (!loadWiFiNetworks(networks, count, MAX_WIFI_NETWORKS)) return false;
    
    for (uint8_t i = 0; i < count; i++) {
        if (networks[i].ssid == ssid) {
            networks[i] = network;
            networks[i].ssid = ssid;  // Preserve original SSID as key
            return saveWiFiNetworks(networks, count);
        }
    }
    
    return false;  // Not found
}

bool removeWiFiNetwork(const String& ssid) {
    WiFiNetwork networks[MAX_WIFI_NETWORKS];
    uint8_t count = 0;
    
    if (!loadWiFiNetworks(networks, count, MAX_WIFI_NETWORKS)) return false;
    
    for (uint8_t i = 0; i < count; i++) {
        if (networks[i].ssid == ssid) {
            // Shift remaining down
            for (uint8_t j = i; j < count - 1; j++) {
                networks[j] = networks[j + 1];
            }
            count--;
            return saveWiFiNetworks(networks, count);
        }
    }
    
    return false;
}

bool reorderWiFiNetworks(const String* ssidOrder, uint8_t count) {
    WiFiNetwork networks[MAX_WIFI_NETWORKS];
    uint8_t currentCount = 0;
    
    if (!loadWiFiNetworks(networks, currentCount, MAX_WIFI_NETWORKS)) return false;
    
    // Reorder based on provided priority list
    WiFiNetwork reordered[MAX_WIFI_NETWORKS];
    uint8_t newCount = 0;
    
    // First add networks in the specified order
    for (uint8_t i = 0; i < count && newCount < MAX_WIFI_NETWORKS; i++) {
        for (uint8_t j = 0; j < currentCount; j++) {
            if (networks[j].ssid == ssidOrder[i]) {
                reordered[newCount] = networks[j];
                reordered[newCount].priority = newCount + 1;
                newCount++;
                break;
            }
        }
    }
    
    // Add any remaining networks not in the order list
    for (uint8_t j = 0; j < currentCount && newCount < MAX_WIFI_NETWORKS; j++) {
        bool found = false;
        for (uint8_t i = 0; i < count; i++) {
            if (networks[j].ssid == ssidOrder[i]) {
                found = true;
                break;
            }
        }
        if (!found) {
            reordered[newCount] = networks[j];
            reordered[newCount].priority = newCount + 1;
            newCount++;
        }
    }
    
    return saveWiFiNetworks(reordered, newCount);
}

WiFiNetwork* findWiFiNetwork(const String& ssid) {
    static WiFiNetwork found;
    WiFiNetwork networks[MAX_WIFI_NETWORKS];
    uint8_t count = 0;
    
    if (!loadWiFiNetworks(networks, count, MAX_WIFI_NETWORKS)) return nullptr;
    
    for (uint8_t i = 0; i < count; i++) {
        if (networks[i].ssid == ssid) {
            found = networks[i];
            return &found;
        }
    }
    
    return nullptr;
}

uint8_t getWiFiNetworkCount() {
    WiFiNetwork networks[MAX_WIFI_NETWORKS];
    uint8_t count = 0;
    loadWiFiNetworks(networks, count, MAX_WIFI_NETWORKS);
    return count;
}

//======================================================================
// TELEGRAM CONFIG
//======================================================================

bool loadTelegramConfig(TelegramConfig& config) {
    JsonDocument doc;
    if (!readJsonFile(STORAGE_TELEGRAM_FILE, doc)) return false;
    
    config.botToken = doc["botToken"] | "";
    config.chatId = doc["chatId"] | "";
    config.enabled = doc["enabled"] | false;
    
    return true;
}

bool saveTelegramConfig(const TelegramConfig& config) {
    JsonDocument doc;
    doc["botToken"] = config.botToken;
    doc["chatId"] = config.chatId;
    doc["enabled"] = config.enabled;
    
    return writeJsonFile(STORAGE_TELEGRAM_FILE, doc);
}

//======================================================================
// SAFE ZONES
//======================================================================

bool loadSafeZones(SafeZone* zones, uint8_t& count, uint8_t maxCount) {
    JsonDocument doc;
    if (!readJsonFile(STORAGE_SAFEZONES_FILE, doc)) {
        count = 0;
        return true;
    }
    
    JsonArray arr = doc.as<JsonArray>();
    count = min<uint8_t>(arr.size(), maxCount);
    
    for (uint8_t i = 0; i < count; i++) {
        JsonObject obj = arr[i];
        zones[i].latitude = obj["latitude"] | 0.0;
        zones[i].longitude = obj["longitude"] | 0.0;
        zones[i].radius = obj["radius"] | 100.0;
        zones[i].name = obj["name"].as<String>();
        zones[i].type = obj["type"] | 2;
        zones[i].enabled = obj["enabled"] | true;
        zones[i].createdAt = obj["createdAt"] | 0UL;
        zones[i].updatedAt = obj["updatedAt"] | 0UL;
    }
    
    return true;
}

bool saveSafeZones(const SafeZone* zones, uint8_t count) {
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    
    for (uint8_t i = 0; i < count; i++) {
        JsonObject obj = arr.add<JsonObject>();
        obj["latitude"] = zones[i].latitude;
        obj["longitude"] = zones[i].longitude;
        obj["radius"] = zones[i].radius;
        obj["name"] = zones[i].name;
        obj["type"] = zones[i].type;
        obj["enabled"] = zones[i].enabled;
        obj["createdAt"] = zones[i].createdAt;
        obj["updatedAt"] = zones[i].updatedAt;
    }
    
    return writeJsonFile(STORAGE_SAFEZONES_FILE, doc);
}

bool addSafeZone(const SafeZone& zone) {
    SafeZone zones[MAX_SAFE_ZONES];
    uint8_t count = 0;
    
    if (!loadSafeZones(zones, count, MAX_SAFE_ZONES)) return false;
    if (count >= MAX_SAFE_ZONES) return false;
    
    zones[count] = zone;
    zones[count].createdAt = millis();
    zones[count].updatedAt = millis();
    count++;
    
    return saveSafeZones(zones, count);
}

bool updateSafeZone(uint8_t index, const SafeZone& zone) {
    SafeZone zones[MAX_SAFE_ZONES];
    uint8_t count = 0;
    
    if (!loadSafeZones(zones, count, MAX_SAFE_ZONES)) return false;
    if (index >= count) return false;
    
    zones[index] = zone;
    zones[index].updatedAt = millis();
    
    return saveSafeZones(zones, count);
}

bool removeSafeZone(uint8_t index) {
    SafeZone zones[MAX_SAFE_ZONES];
    uint8_t count = 0;
    
    if (!loadSafeZones(zones, count, MAX_SAFE_ZONES)) return false;
    if (index >= count) return false;
    
    for (uint8_t i = index; i < count - 1; i++) {
        zones[i] = zones[i + 1];
    }
    count--;
    
    return saveSafeZones(zones, count);
}

//======================================================================
// DEVICE SETTINGS
//======================================================================

bool loadDeviceSettings(DeviceSettings& settings) {
    JsonDocument doc;
    if (!readJsonFile(STORAGE_SETTINGS_FILE, doc)) return false;
    
    settings.deviceName = doc["deviceName"] | "CTN-001";
    settings.fwVersion = doc["fwVersion"] | "1.0";
    settings.batteryCalibrationOffset = doc["batteryCalibrationOffset"] | 0.0;
    settings.gpsUpdateInterval = doc["gpsUpdateInterval"] | 1;
    settings.behaviourInterval = doc["behaviourInterval"] | 5;
    settings.wifiScanInterval = doc["wifiScanInterval"] | 60;
    settings.autoAPFallback = doc["autoAPFallback"] | true;
    settings.apFallbackTimeout = doc["apFallbackTimeout"] | 60;
    settings.powerSaveMode = doc["powerSaveMode"] | false;
    settings.cpuFrequency = doc["cpuFrequency"] | 160;
    settings.debugMode = doc["debugMode"] | false;
    
    return true;
}

bool saveDeviceSettings(const DeviceSettings& settings) {
    JsonDocument doc;
    doc["deviceName"] = settings.deviceName;
    doc["fwVersion"] = settings.fwVersion;
    doc["batteryCalibrationOffset"] = settings.batteryCalibrationOffset;
    doc["gpsUpdateInterval"] = settings.gpsUpdateInterval;
    doc["behaviourInterval"] = settings.behaviourInterval;
    doc["wifiScanInterval"] = settings.wifiScanInterval;
    doc["autoAPFallback"] = settings.autoAPFallback;
    doc["apFallbackTimeout"] = settings.apFallbackTimeout;
    doc["powerSaveMode"] = settings.powerSaveMode;
    doc["cpuFrequency"] = settings.cpuFrequency;
    doc["debugMode"] = settings.debugMode;
    
    return writeJsonFile(STORAGE_SETTINGS_FILE, doc);
}

//======================================================================
// BATTERY CALIBRATION
//======================================================================

bool loadBatteryCalibration(BatteryCalibration& cal) {
    JsonDocument doc;
    if (!readJsonFile(STORAGE_BATTERY_FILE, doc)) return false;
    
    JsonArray arr = doc["voltagePoints"].as<JsonArray>();
    for (uint8_t i = 0; i < 11 && i < arr.size(); i++) {
        cal.voltagePoints[i] = arr[i] | cal.voltagePoints[i];
    }
    
    cal.dividerRatio = doc["dividerRatio"] | 3.2;
    cal.adcReference = doc["adcReference"] | 3.3;
    cal.calibrated = doc["calibrated"] | false;
    
    return true;
}

bool saveBatteryCalibration(const BatteryCalibration& cal) {
    JsonDocument doc;
    JsonArray arr = doc["voltagePoints"].to<JsonArray>();
    
    for (uint8_t i = 0; i < 11; i++) {
        arr.add(cal.voltagePoints[i]);
    }
    
    doc["dividerRatio"] = cal.dividerRatio;
    doc["adcReference"] = cal.adcReference;
    doc["calibrated"] = cal.calibrated;
    
    return writeJsonFile(STORAGE_BATTERY_FILE, doc);
}

//======================================================================
// BEHAVIOUR PROFILE
//======================================================================

bool loadBehaviourProfile(BehaviourProfile& profile) {
    JsonDocument doc;
    if (!readJsonFile(STORAGE_BEHAVIOUR_FILE, doc)) return false;
    
    profile.homeLat = doc["homeLat"] | 0.0;
    profile.homeLon = doc["homeLon"] | 0.0;
    profile.schoolLat = doc["schoolLat"] | 0.0;
    profile.schoolLon = doc["schoolLon"] | 0.0;
    profile.typicalSchoolStart = doc["typicalSchoolStart"] | 480UL;
    profile.typicalSchoolEnd = doc["typicalSchoolEnd"] | 900UL;
    profile.homeLearned = doc["homeLearned"] | false;
    profile.schoolLearned = doc["schoolLearned"] | false;
    profile.lastUpdated = doc["lastUpdated"] | 0UL;
    
    return true;
}

bool saveBehaviourProfile(const BehaviourProfile& profile) {
    JsonDocument doc;
    doc["homeLat"] = profile.homeLat;
    doc["homeLon"] = profile.homeLon;
    doc["schoolLat"] = profile.schoolLat;
    doc["schoolLon"] = profile.schoolLon;
    doc["typicalSchoolStart"] = profile.typicalSchoolStart;
    doc["typicalSchoolEnd"] = profile.typicalSchoolEnd;
    doc["homeLearned"] = profile.homeLearned;
    doc["schoolLearned"] = profile.schoolLearned;
    doc["lastUpdated"] = profile.lastUpdated;
    
    return writeJsonFile(STORAGE_BEHAVIOUR_FILE, doc);
}

//======================================================================
// UTILITY
//======================================================================

bool storageExists(const char* path) {
    return LittleFS.exists(path);
}

size_t getFileSize(const char* path) {
    if (!LittleFS.exists(path)) return 0;
    File file = LittleFS.open(path, "r");
    size_t size = file.size();
    file.close();
    return size;
}

String getStorageInfo() {
    String info = "LittleFS Info:\n";

    FSInfo fs_info;
    LittleFS.info(fs_info);

    info += "Total: " + String(fs_info.totalBytes) + " bytes\n";
    info += "Used:  " + String(fs_info.usedBytes) + " bytes\n";
    info += "Free:  " + String(fs_info.totalBytes - fs_info.usedBytes) + " bytes\n";
    info += "\nFiles:\n";

    Dir dir = LittleFS.openDir("/");
    while (dir.next()) {
        info += "  " + dir.fileName() + " (" + String(dir.fileSize()) + " bytes)\n";
    }

    return info;
}
