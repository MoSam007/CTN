#include "WebDashboard.h"
#include "Config.h"
#include "Utilities.h"
#include "Battery.h"
#include "GPS.h"
#include "Diagnostics.h"
#include "WiFiManager.h"
#include "Behaviour.h"
#include "Storage.h"
#include "Telegram.h"
#include "Alerts.h"
#include "OTAUpdate.h"
#include "DemoMode.h"
#include "BatterySimulator.h"
#include "WebSocket.h"
#include "Logger.h"

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <ESP8266mDNS.h>

// Avoid enum conflict between ESP8266WebServer::HTTPMethod and ESPAsyncWebServer::WebRequestMethod
using ESP8266HTTPMethod = ::HTTPMethod;

//----------------------------------------------------
// Internal Variables
//----------------------------------------------------
static ESP8266WebServer server(WEB_DASHBOARD_PORT);

static bool webDashboardRunning = false;

// Forward declarations
JsonDocument createSuccessResponse(const String& message);
JsonDocument createErrorResponse(const String& message);
bool parseJSONBody(JsonDocument& doc);
String getArg(const String& name, JsonDocument* jsonDoc = nullptr);
bool hasArg(const String& name, JsonDocument* jsonDoc = nullptr);
String getContentType(const String& path);
bool handleFileRead(const String& path);

//----------------------------------------------------
// Helper Functions
//----------------------------------------------------
void sendJSONResponse(int code, const JsonDocument& doc) {
    String output;
    serializeJson(doc, output);
    server.send(code, "application/json", output);
}

void sendErrorResponse(int code, const String& message) {
    JsonDocument doc;
    doc["success"] = false;
    doc["error"] = message;
    sendJSONResponse(code, doc);
}

void sendSuccessResponse(int code, const String& message) {
    JsonDocument doc;
    doc["success"] = true;
    doc["message"] = message;
    sendJSONResponse(code, doc);
}

bool parseJSONBody(JsonDocument& doc) {
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        DeserializationError err = deserializeJson(doc, body);
        return !err;
    }
    return false;
}

String getArg(const String& name, JsonDocument* jsonDoc) {
    if (server.hasArg(name)) {
        return server.arg(name);
    }
    if (jsonDoc && (*jsonDoc).containsKey(name) && (*jsonDoc)[name].is<String>()) {
        return (*jsonDoc)[name].as<String>();
    }
    return String();
}

bool hasArg(const String& name, JsonDocument* jsonDoc) {
    if (server.hasArg(name)) return true;
    if (jsonDoc && (*jsonDoc).containsKey(name)) return true;
    return false;
}

String getContentType(const String& path) {
    if (path.endsWith(".html")) return "text/html";
    else if (path.endsWith(".css")) return "text/css";
    else if (path.endsWith(".js")) return "application/javascript";
    else if (path.endsWith(".json")) return "application/json";
    else if (path.endsWith(".svg")) return "image/svg+xml";
    else if (path.endsWith(".png")) return "image/png";
    else if (path.endsWith(".ico")) return "image/x-icon";
    return "text/plain";
}

bool handleFileRead(const String& path) {
    String filePath = path;
    if (filePath == "/") filePath = "/index.html";

    if (!LittleFS.exists(filePath)) {
        return false;
    }

    File file = LittleFS.open(filePath, "r");
    if (!file) {
        return false;
    }

    server.streamFile(file, getContentType(filePath));
    file.close();
    return true;
}

//----------------------------------------------------
// REST API Endpoints - Device Status
//----------------------------------------------------
void handleAPIStatus() {
    JsonDocument doc;
    doc["deviceName"] = DEVICE_NAME;
    doc["firmwareVersion"] = FW_VERSION;
    doc["uptime"] = millis();
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["heapFragmentation"] = (int)ESP.getHeapFragmentation();
    doc["flashChipSize"] = ESP.getFlashChipSize();
    doc["flashChipRealSize"] = ESP.getFlashChipRealSize();
    doc["cpuFreqMHz"] = ESP.getCpuFreqMHz();
    doc["resetReason"] = ESP.getResetReason();
    doc["wifi"]["mode"] = wifiIsAPMode() ? "AP" : "STA";
    doc["wifi"]["ssid"] = WiFi.isConnected() ? WiFi.SSID() : "";
    doc["wifi"]["rssi"] = WiFi.RSSI();
    doc["wifi"]["ip"] = WiFi.isConnected() ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    doc["wifi"]["connected"] = WiFi.isConnected();
    doc["telegram"]["configured"] = telegramConfigured();
    TelegramConfig tgConfig;
    bool tgLoaded = loadTelegramConfig(tgConfig);
    doc["telegram"]["enabled"] = tgLoaded ? tgConfig.enabled : false;
    doc["battery"]["percentage"] = getBatteryPercentage();
    doc["battery"]["voltage"] = getBatteryVoltage();
    doc["battery"]["state"] = (int)getBatteryState();
    doc["battery"]["charging"] = isBatteryCharging();
    doc["battery"]["health"] = (int)getBatteryHealth();
    doc["battery"]["runtimeHours"] = getBatteryRuntimeEstimate();
    doc["gps"]["fix"] = gpsHasFix();
    doc["gps"]["lat"] = getLatitude();
    doc["gps"]["lon"] = getLongitude();
    doc["gps"]["satellites"] = getSatelliteCount();
    doc["gps"]["hdop"] = getHDOP();
    doc["gps"]["speed"] = getSpeed();
    doc["gps"]["course"] = getCourse();
    doc["behaviour"]["riskScore"] = getRiskScore();
    doc["behaviour"]["state"] = (int)getBehaviourState();
    doc["behaviour"]["stateStr"] = behaviourStateToString(getBehaviourState());
#if CTN_DEMO_MODE
    doc["demoMode"] = demoModeIsActive();
#else
    doc["demoMode"] = false;
#endif
    sendJSONResponse(200, doc);
}

//----------------------------------------------------
// REST API Endpoints - WiFi
//----------------------------------------------------
void handleAPIWiFiStatus() {
    JsonDocument doc;
    doc["mode"] = wifiIsAPMode() ? "AP" : "STA";
    doc["connected"] = WiFi.isConnected();
    if (WiFi.isConnected()) {
        doc["ssid"] = WiFi.SSID();
        doc["rssi"] = WiFi.RSSI();
        doc["ip"] = WiFi.localIP().toString();
        doc["mac"] = WiFi.macAddress();
    } else {
        doc["ap"]["ssid"] = AP_SSID_PREFIX;
        doc["ap"]["ip"] = WiFi.softAPIP().toString();
        doc["ap"]["clients"] = WiFi.softAPgetStationNum();
    }
    sendJSONResponse(200, doc);
}

void handleAPIWifiScan() {
    JsonDocument doc;
    JsonArray networks = doc["networks"].to<JsonArray>();

    int16_t count = WiFi.scanNetworks(false, true); // async scan
    for (int i = 0; i < count; i++) {
        JsonObject obj = networks.add<JsonObject>();
        obj["ssid"] = WiFi.SSID(i);
        obj["rssi"] = WiFi.RSSI(i);
        obj["channel"] = WiFi.channel(i);
        obj["encryption"] = (WiFi.encryptionType(i) == ENC_TYPE_NONE) ? "Open" : "Secured";
    }
    sendJSONResponse(200, doc);
}

void handleAPIWifiSaved() {
    WiFiNetwork networks[MAX_WIFI_NETWORKS];
    uint8_t count = 0;
    loadWiFiNetworks(networks, count, MAX_WIFI_NETWORKS);

    JsonDocument doc;
    JsonArray arr = doc["networks"].to<JsonArray>();
    for (uint8_t i = 0; i < count; i++) {
        JsonObject obj = arr.add<JsonObject>();
        obj["ssid"] = networks[i].ssid;
        obj["priority"] = networks[i].priority;
        obj["autoConnect"] = networks[i].autoConnect;
    }
    sendJSONResponse(200, doc);
}

void handleAPIWifiConnect() {
    String ssid = getArg("ssid");
    String password = getArg("password");

    if (ssid.isEmpty()) {
        sendErrorResponse(400, "SSID required");
        return;
    }

    // Try to connect to the network
    bool success = connectToNetwork(ssid.c_str(), password.c_str());
    if (success) {
        sendSuccessResponse(200, "Connecting to " + ssid);
    } else {
        sendErrorResponse(500, "Connection failed");
    }
}

void handleAPIWifiSave() {
    String ssid = getArg("ssid");
    String password = getArg("password");
    uint8_t priority = getArg("priority").toInt();

    if (ssid.isEmpty()) {
        sendErrorResponse(400, "SSID required");
        return;
    }

    WiFiNetwork network;
    network.ssid = ssid;
    network.password = password;
    network.priority = priority;
    network.autoConnect = true;

    bool success = addWiFiNetwork(network);
    if (success) {
        sendSuccessResponse(200, "Network saved");
    } else {
        sendErrorResponse(500, "Save failed");
    }
}

void handleAPIWifiUpdate() {
    String ssid = getArg("ssid");
    String password = getArg("password");
    uint8_t priority = getArg("priority").toInt();

    if (ssid.isEmpty()) {
        sendErrorResponse(400, "SSID required");
        return;
    }

    WiFiNetwork network;
    network.ssid = ssid;
    network.password = password;
    network.priority = priority;
    network.autoConnect = true;

    bool success = updateWiFiNetwork(ssid, network);
    if (success) {
        sendSuccessResponse(200, "Network updated");
    } else {
        sendErrorResponse(500, "Update failed");
    }
}

void handleAPIWifiRemove() {
    String ssid = getArg("ssid");

    if (ssid.isEmpty()) {
        sendErrorResponse(400, "SSID required");
        return;
    }

    bool success = removeWiFiNetwork(ssid);
    if (success) {
        sendSuccessResponse(200, "Network deleted");
    } else {
        sendErrorResponse(500, "Delete failed");
    }
}

void handleAPIWifiReconnect() {
    WiFi.disconnect();
    sendSuccessResponse(200, "Reconnect initiated");
}

void handleAPIWifiReorder() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    JsonArray order = doc["order"];
    if (order.size() == 0) {
        sendErrorResponse(400, "Order array required");
        return;
    }

    String ssids[MAX_WIFI_NETWORKS];
    for (size_t i = 0; i < order.size(); i++) {
        ssids[i] = order[i].as<String>();
    }

    bool success = reorderWiFiNetworks(ssids, order.size());
    if (success) {
        sendSuccessResponse(200, "Networks reordered");
    } else {
        sendErrorResponse(500, "Reorder failed");
    }
}

//----------------------------------------------------
// REST API Endpoints - Telegram
//----------------------------------------------------
void handleAPITelegramStatus() {
    JsonDocument doc;
    TelegramConfig tgConfig;
    loadTelegramConfig(tgConfig);
    doc["configured"] = telegramConfigured();
    doc["enabled"] = tgConfig.enabled;
    doc["botToken"] = telegramConfigured() ? "***" : "";
    doc["chatId"] = tgConfig.chatId;
    sendJSONResponse(200, doc);
}

void handleAPITelegramSave() {
    String token = getArg("botToken");
    String chatId = getArg("chatId");
    bool enabled = getArg("enabled") == "true";

    if (token.isEmpty() || chatId.isEmpty()) {
        sendErrorResponse(400, "Bot token and chat ID required");
        return;
    }

    TelegramConfig tgConfig;
    tgConfig.botToken = token;
    tgConfig.chatId = chatId;
    tgConfig.enabled = enabled;

    bool success = saveTelegramConfig(tgConfig);
    if (success) {
        reloadTelegramConfig();
        sendSuccessResponse(200, "Telegram config saved");
    } else {
        sendErrorResponse(500, "Save failed");
    }
}

void handleAPITelegramTest() {
    if (!telegramConfigured()) {
        sendErrorResponse(400, "Telegram not configured");
        return;
    }

    String location = "https://maps.google.com/?q=" + String(getLatitude(), 6) + "," + String(getLongitude(), 6);
    uint8_t battery = getBatteryPercentage();
    bool sent = sendTelegramMessage("🧪 Test message from " + String(DEVICE_NAME) + "\nBattery: " + String(battery) + "%\nLocation: " + location);

    if (sent) {
        sendSuccessResponse(200, "Test message sent");
    } else {
        sendErrorResponse(500, "Failed to send test message");
    }
}

//----------------------------------------------------
// REST API Endpoints - Safe Zones
//----------------------------------------------------
void handleAPISafeZonesGet() {
    SafeZone zones[MAX_SAFE_ZONES];
    uint8_t count = 0;
    loadSafeZones(zones, count, MAX_SAFE_ZONES);

    JsonDocument doc;
    JsonArray arr = doc["zones"].to<JsonArray>();
    for (uint8_t i = 0; i < count; i++) {
        JsonObject obj = arr.add<JsonObject>();
        obj["index"] = i;
        obj["name"] = zones[i].name;
        obj["type"] = zones[i].type;
        obj["latitude"] = zones[i].latitude;
        obj["longitude"] = zones[i].longitude;
        obj["radius"] = zones[i].radius;
        obj["enabled"] = zones[i].enabled;
    }
    sendJSONResponse(200, doc);
}

void handleAPISafeZonesPost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        // Try form data
        String name = getArg("name");
        String typeStr = getArg("type");
        String latStr = getArg("latitude");
        String lonStr = getArg("longitude");
        String radiusStr = getArg("radius");
        String enabledStr = getArg("enabled");

        if (name.isEmpty() || latStr.isEmpty() || lonStr.isEmpty()) {
            sendErrorResponse(400, "Missing required fields");
            return;
        }

        SafeZone zone;
        zone.name = name;
        zone.type = typeStr.toInt();
        zone.latitude = latStr.toDouble();
        zone.longitude = lonStr.toDouble();
        zone.radius = radiusStr.toInt();
        zone.enabled = (enabledStr == "true" || enabledStr == "1");

        if (addSafeZone(zone)) {
            sendSuccessResponse(201, "Safe zone added");
        } else {
            sendErrorResponse(500, "Failed to add zone");
        }
        return;
    }

    // JSON body
    SafeZone zone;
    zone.name = doc["name"].as<String>();
    zone.type = doc["type"] | 0;
    zone.latitude = doc["latitude"] | 0.0;
    zone.longitude = doc["longitude"] | 0.0;
    zone.radius = doc["radius"] | 100;
    zone.enabled = doc["enabled"] | true;

    if (addSafeZone(zone)) {
        sendSuccessResponse(201, "Safe zone added");
    } else {
        sendErrorResponse(500, "Failed to add zone");
    }
}

void handleAPISafeZonesPut() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    uint8_t index = doc["index"] | 255;
    if (index >= MAX_SAFE_ZONES) {
        sendErrorResponse(400, "Invalid zone index");
        return;
    }

    SafeZone zone;
    zone.name = doc["name"].as<String>();
    zone.type = doc["type"] | 0;
    zone.latitude = doc["latitude"] | 0.0;
    zone.longitude = doc["longitude"] | 0.0;
    zone.radius = doc["radius"] | 100;
    zone.enabled = doc["enabled"] | true;

    if (updateSafeZone(index, zone)) {
        sendSuccessResponse(200, "Safe zone updated");
    } else {
        sendErrorResponse(500, "Failed to update zone");
    }
}

void handleAPISafeZonesDelete() {
    uint8_t index = getArg("index").toInt();
    if (index >= MAX_SAFE_ZONES) {
        sendErrorResponse(400, "Invalid zone index");
        return;
    }

    if (removeSafeZone(index)) {
        sendSuccessResponse(200, "Safe zone deleted");
    } else {
        sendErrorResponse(500, "Failed to delete zone");
    }
}

//----------------------------------------------------
// REST API Endpoints - Battery
//----------------------------------------------------
void handleAPIBattery() {
    JsonDocument doc;
    doc["percentage"] = getBatteryPercentage();
    doc["voltage"] = getBatteryVoltage();
    doc["state"] = (int)getBatteryState();
    doc["stateStr"] = batteryStateToString(getBatteryState());
    doc["charging"] = batteryIsCharging();
    doc["health"] = (int)getBatteryHealth();
    doc["healthStr"] = (getBatteryHealth() == BATTERY_HEALTH_GOOD) ? "Good" :
                       (getBatteryHealth() == BATTERY_HEALTH_FAIR) ? "Fair" : "Poor";
    doc["runtimeHours"] = getBatteryRuntimeEstimate();
    doc["low"] = batteryLow();
    doc["critical"] = batteryCritical();
    sendJSONResponse(200, doc);
}

//----------------------------------------------------
// REST API Endpoints - GPS
//----------------------------------------------------
void handleAPIGPS() {
    JsonDocument doc;
    doc["fix"] = gpsHasFix();
    doc["latitude"] = getLatitude();
    doc["longitude"] = getLongitude();
    doc["altitude"] = getAltitude();
    doc["speed"] = getSpeed();
    doc["course"] = getCourse();
    doc["satellites"] = getSatelliteCount();
    doc["hdop"] = getHDOP();
    doc["accuracy"] = getHDOP() * 1.5;
    doc["googleMapsLink"] = getGoogleMapsLink();
    doc["timeSinceFix"] = getGPSTimeSinceFix();
    sendJSONResponse(200, doc);
}

//----------------------------------------------------
// REST API Endpoints - Diagnostics
//----------------------------------------------------
void handleAPIDiagnostics() {
    JsonDocument doc;
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["maxFreeBlock"] = ESP.getMaxFreeBlockSize();
    doc["heapFragmentation"] = (int)ESP.getHeapFragmentation();
    doc["flashChipSize"] = ESP.getFlashChipSize();
    doc["flashChipRealSize"] = ESP.getFlashChipRealSize();
    doc["cpuFreqMHz"] = ESP.getCpuFreqMHz();
    doc["resetReason"] = ESP.getResetReason();
    doc["uptime"] = millis();
    sendJSONResponse(200, doc);
}

void handleAPIDiagnosticsFull() {
    JsonDocument doc;
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["maxFreeBlock"] = ESP.getMaxFreeBlockSize();
    doc["heapFragmentation"] = (int)ESP.getHeapFragmentation();
    doc["flashChipSize"] = ESP.getFlashChipSize();
    doc["flashChipRealSize"] = ESP.getFlashChipRealSize();
    doc["cpuFreqMHz"] = ESP.getCpuFreqMHz();
    doc["resetReason"] = ESP.getResetReason();
    doc["uptime"] = millis();
    doc["wifi"]["scanCount"] = getLastScanResultCount();
    doc["gps"]["nmeaSentences"] = getGPSSentencesWithFix();
    doc["gps"]["checksumErrors"] = getGPSFailedChecksum();
    doc["gps"]["charsProcessed"] = getGPSCharsProcessed();
    sendJSONResponse(200, doc);
}

//----------------------------------------------------
// REST API Endpoints - Device Settings
//----------------------------------------------------
void handleAPIDeviceSettingsGet() {
    DeviceSettings settings;
    loadDeviceSettings(settings);

    JsonDocument doc;
    doc["ownerName"] = settings.ownerName;
    doc["phoneNumber"] = settings.phoneNumber;
    doc["timezone"] = settings.timezone;
    doc["language"] = settings.language;
    doc["units"] = settings.units;
    doc["autoUpdate"] = settings.autoUpdate;
    sendJSONResponse(200, doc);
}

void handleAPIDeviceSettingsPost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        // Try form data
        DeviceSettings settings;
        settings.ownerName = getArg("ownerName");
        settings.phoneNumber = getArg("phoneNumber");
        settings.timezone = getArg("timezone");
        settings.language = getArg("language");
        settings.units = getArg("units");
        settings.autoUpdate = getArg("autoUpdate") == "true";

        if (saveDeviceSettings(settings)) {
            sendSuccessResponse(200, "Settings saved");
        } else {
            sendErrorResponse(500, "Save failed");
        }
        return;
    }

    DeviceSettings settings;
    settings.ownerName = doc["ownerName"].as<String>();
    settings.phoneNumber = doc["phoneNumber"].as<String>();
    settings.timezone = doc["timezone"].as<String>();
    settings.language = doc["language"].as<String>();
    settings.units = doc["units"].as<String>();
    settings.autoUpdate = doc["autoUpdate"] | false;

    if (saveDeviceSettings(settings)) {
        sendSuccessResponse(200, "Settings saved");
    } else {
        sendErrorResponse(500, "Save failed");
    }
}

//----------------------------------------------------
// REST API Endpoints - Behaviour
//----------------------------------------------------
void handleAPIBehaviourStatus() {
    JsonDocument doc;
    doc["riskScore"] = getRiskScore();
    doc["state"] = (int)getBehaviourState();
    doc["stateStr"] = behaviourStateToString(getBehaviourState());

    uint8_t anomalyCount = getAnomalyCount();
    JsonArray anomalies = doc["anomalies"].to<JsonArray>();
    for (uint8_t i = 0; i < anomalyCount; i++) {
        AnomalyEvent* event = getAnomalyEvent(i);
        if (event) {
            JsonObject obj = anomalies.add<JsonObject>();
            obj["type"] = (int)event->type;
            obj["confidence"] = event->confidence;
            obj["description"] = event->description;
            obj["timestamp"] = event->timestamp;
            obj["duration"] = event->duration;
            obj["speed"] = event->speed;
            obj["latitude"] = event->latitude;
            obj["longitude"] = event->longitude;
            obj["acknowledged"] = event->acknowledged;
        }
    }

    doc["homeLearned"] = isHomeLearned();
    doc["schoolLearned"] = isSchoolLearned();
    if (isHomeLearned()) {
        doc["home"]["lat"] = getHomeLocation().latitude;
        doc["home"]["lon"] = getHomeLocation().longitude;
    }
    if (isSchoolLearned()) {
        doc["school"]["lat"] = getSchoolLocation().latitude;
        doc["school"]["lon"] = getSchoolLocation().longitude;
    }

    sendJSONResponse(200, doc);
}

void handleAPIBehaviourConfigGet() {
    BehaviourConfig config = getBehaviourConfig();
    JsonDocument doc;
    doc["minVisitsToLearn"] = config.minVisitsToLearn;
    doc["learningRate"] = config.learningRate;
    doc["routeTimeout"] = config.routeTimeout;
    doc["maxDeviationDistance"] = config.maxDeviationDistance;
    doc["maxStopDuration"] = config.maxStopDuration;
    doc["runningSpeedThreshold"] = config.runningSpeedThreshold;
    doc["wanderingSpeedThreshold"] = config.wanderingSpeedThreshold;
    doc["nightStartHour"] = config.nightStartHour;
    doc["nightEndHour"] = config.nightEndHour;
    doc["maxRepeatedMovements"] = config.maxRepeatedMovements;
    doc["watchThreshold"] = config.watchThreshold;
    doc["warningThreshold"] = config.warningThreshold;
    doc["emergencyThreshold"] = config.emergencyThreshold;
    doc["enableRouteDeviationAlerts"] = config.enableRouteDeviationAlerts;
    doc["enableLongStopAlerts"] = config.enableLongStopAlerts;
    doc["enableRunningAlerts"] = config.enableRunningAlerts;
    doc["enableWanderingAlerts"] = config.enableWanderingAlerts;
    doc["enableSchoolAlerts"] = config.enableSchoolAlerts;
    doc["enableSafeZoneAlerts"] = config.enableSafeZoneAlerts;
    doc["enableNightMovementAlerts"] = config.enableNightMovementAlerts;
    doc["enableRepeatedMovementAlerts"] = config.enableRepeatedMovementAlerts;
    sendJSONResponse(200, doc);
}

void handleAPIBehaviourConfigPost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    BehaviourConfig config;
    config.minVisitsToLearn = doc["minVisitsToLearn"] | 3;
    config.learningRate = doc["learningRate"] | 0.1;
    config.routeTimeout = doc["routeTimeout"] | 300000;
    config.maxDeviationDistance = doc["maxDeviationDistance"] | 50.0;
    config.maxStopDuration = doc["maxStopDuration"] | 300000;
    config.runningSpeedThreshold = doc["runningSpeedThreshold"] | 10.0;
    config.wanderingSpeedThreshold = doc["wanderingSpeedThreshold"] | 2.0;
    config.nightStartHour = doc["nightStartHour"] | 22;
    config.nightEndHour = doc["nightEndHour"] | 6;
    config.maxRepeatedMovements = doc["maxRepeatedMovements"] | 5;
    config.watchThreshold = doc["watchThreshold"] | 70;
    config.warningThreshold = doc["warningThreshold"] | 50;
    config.emergencyThreshold = doc["emergencyThreshold"] | 30;
    config.enableRouteDeviationAlerts = doc["enableRouteDeviationAlerts"] | true;
    config.enableLongStopAlerts = doc["enableLongStopAlerts"] | true;
    config.enableRunningAlerts = doc["enableRunningAlerts"] | true;
    config.enableWanderingAlerts = doc["enableWanderingAlerts"] | true;
    config.enableSchoolAlerts = doc["enableSchoolAlerts"] | true;
    config.enableSafeZoneAlerts = doc["enableSafeZoneAlerts"] | true;
    config.enableNightMovementAlerts = doc["enableNightMovementAlerts"] | true;
    config.enableRepeatedMovementAlerts = doc["enableRepeatedMovementAlerts"] | true;

    if (saveBehaviourConfig(config)) {
        sendSuccessResponse(200, "Behaviour config saved");
    } else {
        sendErrorResponse(500, "Save failed");
    }
}

void handleAPIBehaviourRoutes() {
    RoutePoint routes[MAX_ROUTE_POINTS];
    uint8_t count = 0;
    loadLearnedRoutes(routes, count, MAX_ROUTE_POINTS);

    JsonDocument doc;
    JsonArray arr = doc["routes"].to<JsonArray>();
    for (uint8_t i = 0; i < count; i++) {
        JsonObject obj = arr.add<JsonObject>();
        obj["lat"] = routes[i].latitude;
        obj["lon"] = routes[i].longitude;
        obj["time"] = routes[i].typicalTime;
        obj["speed"] = routes[i].typicalSpeed;
        obj["visits"] = routes[i].visitCount;
        obj["zone"] = routes[i].zoneName;
    }
    sendJSONResponse(200, doc);
}

//----------------------------------------------------
// REST API Endpoints - Alerts
//----------------------------------------------------
void handleAPIAlertsHistory() {
    uint8_t count = getAlertHistoryCount();
    if (count > 50) count = 50;

    JsonDocument doc;
    JsonArray arr = doc["alerts"].to<JsonArray>();
    for (uint8_t i = 0; i < count; i++) {
        Alert* alert = getAlertHistory(i);
        if (alert) {
            JsonObject obj = arr.add<JsonObject>();
            obj["index"] = i;
            obj["type"] = alert->type;
            obj["title"] = alert->title;
            obj["message"] = alert->message;
            obj["location"] = alert->location;
            obj["priority"] = alert->priority;
            obj["timestamp"] = alert->timestamp;
            obj["acknowledged"] = alert->acknowledged;
        }
    }
    sendJSONResponse(200, doc);
}

void handleAPIAlertsAcknowledge() {
    uint8_t index = getArg("index").toInt();
    if (acknowledgeAndRemoveAlert(index)) {
        sendSuccessResponse(200, "Alert acknowledged");
    } else {
        sendErrorResponse(404, "Alert not found");
    }
}

//----------------------------------------------------
// REST API Endpoints - OTA
//----------------------------------------------------
void handleAPIOTAStatus() {
    JsonDocument doc;
    doc["state"] = (int)otaGetState();
    doc["progress"] = otaGetProgress();
    doc["error"] = otaGetError();
    doc["inProgress"] = otaInProgress();
    sendJSONResponse(200, doc);
}

void handleAPIOTAUpdate() {
    sendSuccessResponse(200, "OTA update initiated");
}

//----------------------------------------------------
// REST API Endpoints - Telegram Config (alias for frontend)
//----------------------------------------------------
void handleAPITelegramConfigGet() {
    TelegramConfig tgConfig;
    loadTelegramConfig(tgConfig);
    JsonDocument doc;
    doc["enabled"] = tgConfig.enabled;
    doc["token"] = tgConfig.botToken;
    doc["chatId"] = tgConfig.chatId;
    sendJSONResponse(200, doc);
}

void handleAPITelegramConfigPost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    TelegramConfig tgConfig;
    tgConfig.enabled = doc["enabled"] | false;
    tgConfig.botToken = doc["token"].as<String>();
    tgConfig.chatId = doc["chatId"].as<String>();

    if (saveTelegramConfig(tgConfig)) {
        reloadTelegramConfig();
        sendSuccessResponse(200, "Telegram config saved");
    } else {
        sendErrorResponse(500, "Save failed");
    }
}

//----------------------------------------------------
// REST API Endpoints - Power Config
//----------------------------------------------------
void handleAPIPowerConfigGet() {
    DeviceSettings settings;
    loadDeviceSettings(settings);

    JsonDocument doc;
    doc["cpuFreq"] = settings.cpuFrequency;
    doc["powerSave"] = settings.powerSaveMode;
    doc["gpsInterval"] = settings.gpsUpdateInterval;
    doc["behaviourInterval"] = settings.behaviourInterval;
    doc["batteryCritical"] = 15; // Could add to settings struct
    doc["batteryLow"] = 30;
    sendJSONResponse(200, doc);
}

void handleAPIPowerConfigPost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    DeviceSettings settings;
    loadDeviceSettings(settings);

    settings.cpuFrequency = doc["cpuFreq"] | 160;
    settings.powerSaveMode = doc["powerSave"] | false;
    settings.gpsUpdateInterval = doc["gpsInterval"] | 30;
    settings.behaviourInterval = doc["behaviourInterval"] | 60;

    if (saveDeviceSettings(settings)) {
        sendSuccessResponse(200, "Power settings saved");
    } else {
        sendErrorResponse(500, "Save failed");
    }
}

//----------------------------------------------------
// REST API Endpoints - Network Config
//----------------------------------------------------
void handleAPINetworkConfigGet() {
    DeviceSettings settings;
    loadDeviceSettings(settings);

    JsonDocument doc;
    doc["apFallback"] = settings.autoAPFallback;
    doc["fallbackTimeout"] = settings.apFallbackTimeout;
    doc["scanInterval"] = settings.wifiScanInterval;
    doc["maxReconnect"] = 3; // Could add to settings
    doc["apSsid"] = AP_SSID_PREFIX;
    doc["apPassword"] = AP_PASSWORD;
    doc["apChannel"] = 1;
    sendJSONResponse(200, doc);
}

void handleAPINetworkConfigPost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    DeviceSettings settings;
    loadDeviceSettings(settings);

    settings.autoAPFallback = doc["apFallback"] | true;
    settings.apFallbackTimeout = doc["fallbackTimeout"] | 60;
    settings.wifiScanInterval = doc["scanInterval"] | 30;

    // Note: AP credentials and channel require WiFi.softAPConfig which needs restart
    // Would need to be stored and applied on next boot

    if (saveDeviceSettings(settings)) {
        sendSuccessResponse(200, "Network settings saved (restart may be needed for AP changes)");
    } else {
        sendErrorResponse(500, "Save failed");
    }
}

//----------------------------------------------------
// REST API Endpoints - Config Export/Import
//----------------------------------------------------
void handleAPIConfigExport() {
    JsonDocument doc;

    // Export all configs
    WiFiNetwork networks[MAX_WIFI_NETWORKS];
    uint8_t netCount = 0;
    loadWiFiNetworks(networks, netCount, MAX_WIFI_NETWORKS);

    JsonArray wifiArr = doc["wifiNetworks"].to<JsonArray>();
    for (uint8_t i = 0; i < netCount; i++) {
        JsonObject obj = wifiArr.add<JsonObject>();
        obj["ssid"] = networks[i].ssid;
        obj["password"] = networks[i].password;
        obj["priority"] = networks[i].priority;
        obj["autoConnect"] = networks[i].autoConnect;
    }

    TelegramConfig tgConfig;
    loadTelegramConfig(tgConfig);
    doc["telegram"]["enabled"] = tgConfig.enabled;
    doc["telegram"]["token"] = tgConfig.botToken;
    doc["telegram"]["chatId"] = tgConfig.chatId;

    SafeZone zones[MAX_SAFE_ZONES];
    uint8_t zoneCount = 0;
    loadSafeZones(zones, zoneCount, MAX_SAFE_ZONES);
    JsonArray zoneArr = doc["safeZones"].to<JsonArray>();
    for (uint8_t i = 0; i < zoneCount; i++) {
        JsonObject obj = zoneArr.add<JsonObject>();
        obj["name"] = zones[i].name;
        obj["type"] = zones[i].type;
        obj["latitude"] = zones[i].latitude;
        obj["longitude"] = zones[i].longitude;
        obj["radius"] = zones[i].radius;
        obj["enabled"] = zones[i].enabled;
    }

    DeviceSettings settings;
    loadDeviceSettings(settings);
    doc["deviceSettings"]["ownerName"] = settings.ownerName;
    doc["deviceSettings"]["phoneNumber"] = settings.phoneNumber;
    doc["deviceSettings"]["timezone"] = settings.timezone;
    doc["deviceSettings"]["language"] = settings.language;
    doc["deviceSettings"]["units"] = settings.units;
    doc["deviceSettings"]["autoUpdate"] = settings.autoUpdate;
    doc["deviceSettings"]["cpuFrequency"] = settings.cpuFrequency;
    doc["deviceSettings"]["powerSaveMode"] = settings.powerSaveMode;
    doc["deviceSettings"]["gpsUpdateInterval"] = settings.gpsUpdateInterval;
    doc["deviceSettings"]["behaviourInterval"] = settings.behaviourInterval;
    doc["deviceSettings"]["wifiScanInterval"] = settings.wifiScanInterval;
    doc["deviceSettings"]["autoAPFallback"] = settings.autoAPFallback;
    doc["deviceSettings"]["apFallbackTimeout"] = settings.apFallbackTimeout;
    doc["deviceSettings"]["batteryCalibrationOffset"] = settings.batteryCalibrationOffset;

    BehaviourConfig bConfig = getBehaviourConfig();
    doc["behaviourConfig"]["enabled"] = bConfig.enabled;
    doc["behaviourConfig"]["sensitivity"] = bConfig.sensitivity;
    doc["behaviourConfig"]["deviationThreshold"] = bConfig.maxDeviationDistance;
    doc["behaviourConfig"]["longStopDuration"] = bConfig.maxStopDuration / 1000 / 60;
    doc["behaviourConfig"]["nightStart"] = bConfig.nightStartHour;
    doc["behaviourConfig"]["nightEnd"] = bConfig.nightEndHour;
    doc["behaviourConfig"]["maxWalkingSpeed"] = bConfig.maxWalkingSpeed;
    doc["behaviourConfig"]["minRunningSpeed"] = bConfig.runningSpeedThreshold;
    doc["behaviourConfig"]["minVehicleSpeed"] = 25;

    BatteryCalibration batCal;
    loadBatteryCalibration(batCal);
    doc["batteryCalibration"]["dividerRatio"] = batCal.dividerRatio;
    doc["batteryCalibration"]["adcReference"] = batCal.adcReference;
    doc["batteryCalibration"]["calibrated"] = batCal.calibrated;
    JsonArray vp = doc["batteryCalibration"]["voltagePoints"].to<JsonArray>();
    for (int i = 0; i < 11; i++) vp.add(batCal.voltagePoints[i]);

    sendJSONResponse(200, doc);
}

void handleAPIConfigImport() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    // Import WiFi networks
    if (doc["wifiNetworks"].is<JsonArray>()) {
        JsonArray arr = doc["wifiNetworks"].as<JsonArray>();
        for (JsonObject obj : arr) {
            WiFiNetwork net;
            net.ssid = obj["ssid"].as<String>();
            net.password = obj["password"].as<String>();
            net.priority = obj["priority"] | 1;
            net.autoConnect = obj["autoConnect"] | true;
            addWiFiNetwork(net);
        }
    }

    // Import Telegram
    if (doc["telegram"].is<JsonObject>()) {
        TelegramConfig tgConfig;
        tgConfig.enabled = doc["telegram"]["enabled"] | false;
        tgConfig.botToken = doc["telegram"]["token"].as<String>();
        tgConfig.chatId = doc["telegram"]["chatId"].as<String>();
        saveTelegramConfig(tgConfig);
        reloadTelegramConfig();
    }

    // Import Safe Zones
    if (doc["safeZones"].is<JsonArray>()) {
        JsonArray arr = doc["safeZones"].as<JsonArray>();
        for (JsonObject obj : arr) {
            SafeZone zone;
            zone.name = obj["name"].as<String>();
            zone.type = obj["type"] | 2;
            zone.latitude = obj["latitude"] | 0.0;
            zone.longitude = obj["longitude"] | 0.0;
            zone.radius = obj["radius"] | 100;
            zone.enabled = obj["enabled"] | true;
            addSafeZone(zone);
        }
    }

    // Import Device Settings
    if (doc["deviceSettings"].is<JsonObject>()) {
        DeviceSettings settings;
        settings.ownerName = doc["deviceSettings"]["ownerName"].as<String>();
        settings.phoneNumber = doc["deviceSettings"]["phoneNumber"].as<String>();
        settings.timezone = doc["deviceSettings"]["timezone"].as<String>();
        settings.language = doc["deviceSettings"]["language"].as<String>();
        settings.units = doc["deviceSettings"]["units"].as<String>();
        settings.autoUpdate = doc["deviceSettings"]["autoUpdate"] | false;
        settings.cpuFrequency = doc["deviceSettings"]["cpuFrequency"] | 160;
        settings.powerSaveMode = doc["deviceSettings"]["powerSaveMode"] | false;
        settings.gpsUpdateInterval = doc["deviceSettings"]["gpsUpdateInterval"] | 30;
        settings.behaviourInterval = doc["deviceSettings"]["behaviourInterval"] | 60;
        settings.wifiScanInterval = doc["deviceSettings"]["wifiScanInterval"] | 60;
        settings.autoAPFallback = doc["deviceSettings"]["autoAPFallback"] | true;
        settings.apFallbackTimeout = doc["deviceSettings"]["apFallbackTimeout"] | 60;
        settings.batteryCalibrationOffset = doc["deviceSettings"]["batteryCalibrationOffset"] | 0.0;
        saveDeviceSettings(settings);
    }

    // Import Behaviour Config
    if (doc["behaviourConfig"].is<JsonObject>()) {
        BehaviourConfig config;
        config.enabled = doc["behaviourConfig"]["enabled"] | true;
        config.sensitivity = doc["behaviourConfig"]["sensitivity"] | "medium";
        config.maxDeviationDistance = doc["behaviourConfig"]["deviationThreshold"] | 100;
        config.maxStopDuration = (doc["behaviourConfig"]["longStopDuration"] | 5) * 60 * 1000;
        config.nightStartHour = doc["behaviourConfig"]["nightStart"] | 22;
        config.nightEndHour = doc["behaviourConfig"]["nightEnd"] | 6;
        config.maxWalkingSpeed = doc["behaviourConfig"]["maxWalkingSpeed"] | 7;
        config.runningSpeedThreshold = doc["behaviourConfig"]["minRunningSpeed"] | 12;
        saveBehaviourConfig(config);
    }

    // Import Battery Calibration
    if (doc["batteryCalibration"].is<JsonObject>()) {
        BatteryCalibration cal;
        cal.dividerRatio = doc["batteryCalibration"]["dividerRatio"] | 3.2;
        cal.adcReference = doc["batteryCalibration"]["adcReference"] | 1.0;
        cal.calibrated = doc["batteryCalibration"]["calibrated"] | false;
        JsonArray vp = doc["batteryCalibration"]["voltagePoints"].as<JsonArray>();
        for (int i = 0; i < 11 && i < vp.size(); i++) {
            cal.voltagePoints[i] = vp[i] | 0.0;
        }
        saveBatteryCalibration(cal);
    }

    sendSuccessResponse(200, "Configuration imported successfully");
}

//----------------------------------------------------
// REST API Endpoints - Device Factory Reset (alias)
//----------------------------------------------------
void handleAPIDeviceFactoryReset() {
    sendSuccessResponse(200, "Factory reset initiated");
    delay(500);
    LittleFS.format();
    ESP.restart();
}

//----------------------------------------------------
// REST API Endpoints - Alert Test
//----------------------------------------------------
void handleAPIAlertsTest() {
    String location = "https://maps.google.com/?q=" + String(getLatitude(), 6) + "," + String(getLongitude(), 6);
    uint8_t battery = getBatteryPercentage();
    bool sent = sendTelegramMessage("🧪 Test message from " + String(DEVICE_NAME) + "\nBattery: " + String(battery) + "%\nLocation: " + location);

    if (sent) {
        sendSuccessResponse(200, "Test message sent");
    } else {
        sendErrorResponse(500, "Failed to send test message");
    }
}

//----------------------------------------------------
// REST API Endpoints - Behaviour Test Anomaly & Config Reset
//----------------------------------------------------
void handleAPIBehaviourTestAnomaly() {
    behaviourInjectAnomaly(ANOMALY_ROUTE_DEVIATION);
    sendSuccessResponse(200, "Test anomaly injected");
}

void handleAPIBehaviourConfigReset() {
    BehaviourConfig config;
    config.minVisitsToLearn = 3;
    config.learningRate = 0.1;
    config.routeTimeout = 300000;
    config.maxDeviationDistance = 50;
    config.maxStopDuration = 300000;
    config.runningSpeedThreshold = 12;
    config.wanderingSpeedThreshold = 2;
    config.nightStartHour = 22;
    config.nightEndHour = 6;
    config.maxRepeatedMovements = 5;
    config.watchThreshold = 70;
    config.warningThreshold = 50;
    config.emergencyThreshold = 30;
    config.enableRouteDeviationAlerts = true;
    config.enableLongStopAlerts = true;
    config.enableRunningAlerts = true;
    config.enableWanderingAlerts = true;
    config.enableSchoolAlerts = true;
    config.enableSafeZoneAlerts = true;
    config.enableNightMovementAlerts = true;
    config.enableRepeatedMovementAlerts = true;

    if (saveBehaviourConfig(config)) {
        sendSuccessResponse(200, "Behaviour config reset to defaults");
    } else {
        sendErrorResponse(500, "Reset failed");
    }
}

//----------------------------------------------------
// REST API Endpoints - Demo Mode
//----------------------------------------------------
void handleAPIDemoConfigGet() {
    JsonDocument doc;
    doc["enabled"] = demoModeIsActive();
    // demoModeGetCurrentScenario doesn't exist, use getScenarioName
    doc["scenario"] = demoScenarioToString(DEMO_IDLE); // Will be converted to string
    doc["drainRate"] = 1.0;
    doc["charging"] = false;
    doc["gpsNoise"] = 0;
    sendJSONResponse(200, doc);
}

void handleAPIDemoModePost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    bool enabled = doc["enabled"] | false;
    if (enabled) {
        // Start demo mode with default scenario
        demoModeSetScenarioByName("idle");
    } else {
        demoModeStop();
    }

    JsonDocument resp;
    resp["enabled"] = demoModeIsActive();
    sendJSONResponse(200, resp);
}

void handleAPIDemoScenarioPost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    String scenario = doc["scenario"].as<String>();
    demoModeSetScenarioByName(scenario);

    JsonDocument resp;
    resp["scenario"] = scenario;
    sendJSONResponse(200, resp);
}

void handleAPIDemoStepPost() {
    // Step demo scenario forward
    sendSuccessResponse(200, "Demo stepped");
}

void handleAPIDemoResetPost() {
    demoModeSetScenarioByName("idle");
    sendSuccessResponse(200, "Demo reset to idle");
}

void handleAPIDemoSimulatorPost() {
    JsonDocument doc;
    if (!parseJSONBody(doc)) {
        sendErrorResponse(400, "Invalid JSON");
        return;
    }

    float drainRate = doc["drainRate"] | 1.0;
    bool charging = doc["charging"] | false;
    int gpsNoise = doc["gpsNoise"] | 0;

    #if CTN_BATTERY_SIMULATOR
    batterySimulatorSetDrainRate(drainRate);
    batterySimulatorSetPlugged(charging);
    #endif

    sendSuccessResponse(200, "Simulator settings updated");
}

//----------------------------------------------------
// File Serving
//----------------------------------------------------
void serveDashboardFile(const String& path) {
    if (!handleFileRead(path)) {
        sendErrorResponse(404, "File not found: " + path);
    }
}

void handleNotFound() {
    if (!handleFileRead(server.uri())) {
        sendErrorResponse(404, "Not found: " + server.uri());
    }
}

//----------------------------------------------------
// Public API
//----------------------------------------------------
void initWebDashboard() {
    // Initialize LittleFS
    if (!LittleFS.begin()) {
        Serial.println("LittleFS mount failed");
        return;
    }

    // Setup mDNS
    if (MDNS.begin("ctn")) {
        Serial.println("mDNS responder started: http://ctn.local");
    }

    // Configure REST API routes
    server.on("/api/status", ESP8266HTTPMethod::HTTP_GET, handleAPIStatus);
    server.on("/api/device", ESP8266HTTPMethod::HTTP_GET, handleAPIStatus);
    server.on("/api/battery", ESP8266HTTPMethod::HTTP_GET, handleAPIBattery);
    server.on("/api/gps", ESP8266HTTPMethod::HTTP_GET, handleAPIGPS);

    server.on("/api/wifi/status", ESP8266HTTPMethod::HTTP_GET, handleAPIWiFiStatus);
    server.on("/api/wifi/scan", ESP8266HTTPMethod::HTTP_GET, handleAPIWifiScan);
    server.on("/api/wifi/saved", ESP8266HTTPMethod::HTTP_GET, handleAPIWifiSaved);
    server.on("/api/wifi/connect", ESP8266HTTPMethod::HTTP_POST, handleAPIWifiConnect);
    server.on("/api/wifi/save", ESP8266HTTPMethod::HTTP_POST, handleAPIWifiSave);
    server.on("/api/wifi/update", ESP8266HTTPMethod::HTTP_PUT, handleAPIWifiUpdate);
    server.on("/api/wifi/remove", ESP8266HTTPMethod::HTTP_DELETE, handleAPIWifiRemove);
    server.on("/api/wifi/reconnect", ESP8266HTTPMethod::HTTP_POST, handleAPIWifiReconnect);
    server.on("/api/wifi/reorder", ESP8266HTTPMethod::HTTP_POST, handleAPIWifiReorder);

    server.on("/api/device/restart", ESP8266HTTPMethod::HTTP_POST, []() {
        sendSuccessResponse(200, "Restarting...");
        delay(500);
        ESP.restart();
    });

    server.on("/api/device/reset", ESP8266HTTPMethod::HTTP_POST, []() {
        sendSuccessResponse(200, "Factory reset");
        delay(500);
        LittleFS.format();
        ESP.restart();
    });

    server.on("/api/telegram/status", ESP8266HTTPMethod::HTTP_GET, handleAPITelegramStatus);
    server.on("/api/telegram/save", ESP8266HTTPMethod::HTTP_POST, handleAPITelegramSave);
    server.on("/api/telegram/test", ESP8266HTTPMethod::HTTP_POST, handleAPITelegramTest);

    // Telegram config alias (for frontend compatibility)
    server.on("/api/telegram/config", ESP8266HTTPMethod::HTTP_GET, handleAPITelegramConfigGet);
    server.on("/api/telegram/config", ESP8266HTTPMethod::HTTP_POST, handleAPITelegramConfigPost);

    server.on("/api/safe-zones", ESP8266HTTPMethod::HTTP_GET, handleAPISafeZonesGet);
    server.on("/api/safe-zones", ESP8266HTTPMethod::HTTP_POST, handleAPISafeZonesPost);
    server.on("/api/safe-zones", ESP8266HTTPMethod::HTTP_PUT, handleAPISafeZonesPut);
    server.on("/api/safe-zones", ESP8266HTTPMethod::HTTP_DELETE, handleAPISafeZonesDelete);

    server.on("/api/behaviour/status", ESP8266HTTPMethod::HTTP_GET, handleAPIBehaviourStatus);
    server.on("/api/behaviour/config", ESP8266HTTPMethod::HTTP_GET, handleAPIBehaviourConfigGet);
    server.on("/api/behaviour/config", ESP8266HTTPMethod::HTTP_POST, handleAPIBehaviourConfigPost);
    server.on("/api/behaviour/routes", ESP8266HTTPMethod::HTTP_GET, handleAPIBehaviourRoutes);
    server.on("/api/behaviour/test-anomaly", ESP8266HTTPMethod::HTTP_POST, handleAPIBehaviourTestAnomaly);
    server.on("/api/behaviour/config/reset", ESP8266HTTPMethod::HTTP_POST, handleAPIBehaviourConfigReset);

    server.on("/api/diagnostics", ESP8266HTTPMethod::HTTP_GET, handleAPIDiagnostics);
    server.on("/api/diagnostics/full", ESP8266HTTPMethod::HTTP_GET, handleAPIDiagnosticsFull);

    server.on("/api/device/settings", ESP8266HTTPMethod::HTTP_GET, handleAPIDeviceSettingsGet);
    server.on("/api/device/settings", ESP8266HTTPMethod::HTTP_POST, handleAPIDeviceSettingsPost);

    server.on("/api/alerts/history", ESP8266HTTPMethod::HTTP_GET, handleAPIAlertsHistory);
    server.on("/api/alerts/acknowledge", ESP8266HTTPMethod::HTTP_POST, handleAPIAlertsAcknowledge);
    server.on("/api/alerts/test", ESP8266HTTPMethod::HTTP_POST, handleAPIAlertsTest);

    server.on("/api/ota/status", ESP8266HTTPMethod::HTTP_GET, handleAPIOTAStatus);
    server.on("/api/ota/update", ESP8266HTTPMethod::HTTP_POST, handleAPIOTAUpdate);

    // Power management
    server.on("/api/power/config", ESP8266HTTPMethod::HTTP_GET, handleAPIPowerConfigGet);
    server.on("/api/power/config", ESP8266HTTPMethod::HTTP_POST, handleAPIPowerConfigPost);

    // Network config
    server.on("/api/network/config", ESP8266HTTPMethod::HTTP_GET, handleAPINetworkConfigGet);
    server.on("/api/network/config", ESP8266HTTPMethod::HTTP_POST, handleAPINetworkConfigPost);

    // Config import/export
    server.on("/api/config/export", ESP8266HTTPMethod::HTTP_GET, handleAPIConfigExport);
    server.on("/api/config/import", ESP8266HTTPMethod::HTTP_POST, handleAPIConfigImport);

    // Device factory reset alias
    server.on("/api/device/factory-reset", ESP8266HTTPMethod::HTTP_POST, handleAPIDeviceFactoryReset);

    // Demo Mode
    server.on("/api/demo/config", ESP8266HTTPMethod::HTTP_GET, handleAPIDemoConfigGet);
    server.on("/api/demo/mode", ESP8266HTTPMethod::HTTP_POST, handleAPIDemoModePost);
    server.on("/api/demo/scenario", ESP8266HTTPMethod::HTTP_POST, handleAPIDemoScenarioPost);
    server.on("/api/demo/step", ESP8266HTTPMethod::HTTP_POST, handleAPIDemoStepPost);
    server.on("/api/demo/reset", ESP8266HTTPMethod::HTTP_POST, handleAPIDemoResetPost);
    server.on("/api/demo/simulator", ESP8266HTTPMethod::HTTP_POST, handleAPIDemoSimulatorPost);

    // File serving
    server.on("/", ESP8266HTTPMethod::HTTP_GET, []() { serveDashboardFile("/index.html"); });
    server.onNotFound(handleNotFound);

    server.begin();
    webDashboardRunning = true;

    // Initialize WebSocket server for real-time telemetry - DISABLED for stability
    // initWebSocket();

    Serial.println("Web Dashboard started on port " + String(WEB_DASHBOARD_PORT));
    Serial.print("Dashboard URL: http://");
    if (wifiIsAPMode()) {
        Serial.println(WiFi.softAPIP());
    } else {
        Serial.println(WiFi.localIP());
    }
}

void serviceWebDashboard() {
    if (!webDashboardRunning) return;
    server.handleClient();
    // serviceWebSocket();  // Service WebSocket - DISABLED for stability
    MDNS.update();
}

bool isWebDashboardRunning() {
    return webDashboardRunning;
}