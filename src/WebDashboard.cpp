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

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <ESP8266mDNS.h>

//----------------------------------------------------
// Internal Variables
//----------------------------------------------------
static ESP8266WebServer server(WEB_DASHBOARD_PORT);
static bool webDashboardRunning = false;

// Forward declarations
JsonDocument createSuccessResponse(const String& message);
JsonDocument createErrorResponse(const String& message);

void handleAPITelegramStatus();
void handleAPITelegramSave();
void handleAPITelegramTest();

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

JsonDocument createSuccessResponse(const String& message) {
    JsonDocument doc;
    doc["success"] = true;
    doc["message"] = message;
    return doc;
}

JsonDocument createErrorResponse(const String& message) {
    JsonDocument doc;
    doc["success"] = false;
    doc["error"] = message;
    return doc;
}

// Parse JSON body from request (for API calls sending application/json)
bool parseJSONBody(JsonDocument& doc) {
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        DeserializationError err = deserializeJson(doc, body);
        return !err;
    }
    return false;
}

// Get argument from either form data or JSON body
String getArg(const String& name, JsonDocument* jsonDoc = nullptr) {
    if (server.hasArg(name)) {
        return server.arg(name);
    }
    if (jsonDoc && (*jsonDoc)[name].is<String>()) {
        return (*jsonDoc)[name].as<String>();
    }
    return String();
}

bool hasArg(const String& name, JsonDocument* jsonDoc = nullptr) {
    if (server.hasArg(name)) return true;
    if (jsonDoc && (*jsonDoc)[name].is<String>()) return true;
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
// Lifecycle
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

    // Configure routes
    server.on("/api/status", HTTP_GET, handleAPIStatus);
    server.on("/api/device", HTTP_GET, handleAPIDevice);
    server.on("/api/battery", HTTP_GET, handleAPIBattery);
    server.on("/api/gps", HTTP_GET, handleAPIGPS);

    server.on("/api/wifi/status", HTTP_GET, handleAPIWiFiStatus);
    server.on("/api/wifi/scan", HTTP_GET, handleAPIWiFiScan);
    server.on("/api/wifi/saved", HTTP_GET, handleAPIWiFiSaved);
    server.on("/api/wifi/connect", HTTP_POST, handleAPIWiFiConnect);
    server.on("/api/wifi/save", HTTP_POST, handleAPIWiFiSave);
    server.on("/api/wifi/update", HTTP_PUT, handleAPIWiFiUpdate);
    server.on("/api/wifi/remove", HTTP_DELETE, handleAPIWiFiRemove);
    server.on("/api/wifi/reconnect", HTTP_POST, handleAPIWiFiReconnect);
    server.on("/api/wifi/reorder", HTTP_POST, handleAPIWiFiReorder);

    server.on("/api/device/restart", HTTP_POST, handleAPIDeviceRestart);
    server.on("/api/device/reset", HTTP_POST, handleAPIDeviceReset);

    server.on("/api/telegram/status", HTTP_GET, handleAPITelegramStatus);
    server.on("/api/telegram/save", HTTP_POST, handleAPITelegramSave);
    server.on("/api/telegram/test", HTTP_POST, handleAPITelegramTest);

    // File serving routes
    server.on("/", HTTP_GET, []() {
        serveDashboardFile("/index.html");
    });

    server.onNotFound(handleNotFound);

    server.begin();
    webDashboardRunning = true;

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
    MDNS.update();
}

bool isWebDashboardRunning() {
    return webDashboardRunning;
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
// REST API Endpoints - Device Status
//----------------------------------------------------
void handleAPIStatus() {
    JsonDocument doc;

    // Battery
    doc["battery"]["percentage"] = getBatteryPercentage();
    doc["battery"]["voltage"] = getBatteryVoltage();
    doc["battery"]["state"] = batteryStateToString(getBatteryState());
    doc["battery"]["charging"] = false;

    // GPS
    doc["gps"]["latitude"] = getLatitude();
    doc["gps"]["longitude"] = getLongitude();
    doc["gps"]["satellites"] = getSatelliteCount();
    doc["gps"]["hdop"] = getHDOP();
    doc["gps"]["speed"] = getSpeed();
    doc["gps"]["heading"] = getCourse();
    doc["gps"]["altitude"] = getAltitude();
    doc["gps"]["hasFix"] = gpsHasFix();

    // WiFi
    doc["wifi"]["connected"] = wifiConnected();
    doc["wifi"]["apMode"] = wifiIsAPMode();
    doc["wifi"]["ssid"] = getSSID();
    doc["wifi"]["ip"] = getIPAddress();
    doc["wifi"]["rssi"] = getRSSI();

    // Telegram
    doc["telegram"]["connected"] = wifiConnected();

    // Firmware
    doc["firmware"]["version"] = FW_VERSION;
    doc["firmware"]["deviceName"] = DEVICE_NAME;
    doc["firmware"]["freeHeap"] = ESP.getFreeHeap();
    doc["firmware"]["uptime"] = millis() / 1000;
    doc["firmware"]["chipId"] = ESP.getChipId();

    // Current state
    doc["state"]["behaviour"] = behaviourStateToString(getBehaviourState());
    doc["state"]["riskScore"] = getRiskScore();

    sendJSONResponse(200, doc);
}

void handleAPIDevice() {
    JsonDocument doc;
    doc["deviceName"] = DEVICE_NAME;
    doc["firmwareVersion"] = FW_VERSION;
    doc["chipId"] = ESP.getChipId();
    doc["flashChipId"] = ESP.getFlashChipId();
    doc["flashChipSize"] = ESP.getFlashChipSize();
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["heapFragmentation"] = (int)((1.0 - (float)ESP.getMaxFreeBlockSize() / ESP.getFreeHeap()) * 100);
    doc["uptime"] = millis() / 1000;
    doc["resetReason"] = ESP.getResetReason();
    doc["cpuFreqMHz"] = ESP.getCpuFreqMHz();
    doc["sketchSize"] = ESP.getSketchSize();
    doc["freeSketchSpace"] = ESP.getFreeSketchSpace();
    sendJSONResponse(200, doc);
}

void handleAPIBattery() {
    JsonDocument doc;
    doc["percentage"] = getBatteryPercentage();
    doc["voltage"] = getBatteryVoltage();
    doc["state"] = batteryStateToString(getBatteryState());
    doc["stateCode"] = (int)getBatteryState();
    doc["charging"] = false;
    doc["runtimeEstimateHours"] = getBatteryPercentage() > 0 ? (getBatteryPercentage() * 0.24) : 0;
    doc["health"] = getBatteryPercentage() > 80 ? "Good" : (getBatteryPercentage() > 30 ? "Fair" : "Poor");
    sendJSONResponse(200, doc);
}

void handleAPIGPS() {
    JsonDocument doc;
    doc["latitude"] = getLatitude();
    doc["longitude"] = getLongitude();
    doc["satellites"] = getSatelliteCount();
    doc["hdop"] = getHDOP();
    doc["speed"] = getSpeed();
    doc["heading"] = getCourse();
    doc["altitude"] = getAltitude();
    doc["hasFix"] = gpsHasFix();
    doc["locationValid"] = gpsLocationValid();
    doc["timeValid"] = gpsTimeValid();
    doc["accuracy"] = getHDOP() > 0 ? getHDOP() * 5.0 : 0;
    sendJSONResponse(200, doc);
}

//----------------------------------------------------
// REST API Endpoints - WiFi
//----------------------------------------------------
void handleAPIWiFiStatus() {
    JsonDocument doc;
    doc["connected"] = wifiConnected();
    doc["apMode"] = wifiIsAPMode();

    if (wifiConnected()) {
        doc["ssid"] = getSSID();
        doc["ip"] = getIPAddress();
        doc["gateway"] = WiFi.gatewayIP().toString();
        doc["dns"] = WiFi.dnsIP().toString();
        doc["subnetMask"] = WiFi.subnetMask().toString();
        doc["rssi"] = getRSSI();
        doc["signalQuality"] = mapFloat(getRSSI(), -100, -30, 0, 100);
        doc["macAddress"] = WiFi.macAddress();
        doc["channel"] = getChannel();
    }

    // Internet connectivity check
    doc["internet"] = checkInternetConnectivity();

    sendJSONResponse(200, doc);
}

void handleAPIWiFiScan() {
    int n = WiFi.scanComplete();

    if (n == WIFI_SCAN_RUNNING) {
        JsonDocument doc;
        doc["scanning"] = true;
        sendJSONResponse(202, doc);
        return;
    }

    if (n < 0) {
        // Start a new scan
        WiFi.scanNetworks(true);
        JsonDocument doc;
        doc["scanning"] = true;
        doc["message"] = "Scan started";
        sendJSONResponse(202, doc);
        return;
    }

    JsonDocument doc;
    JsonArray networks = doc["networks"].to<JsonArray>();

    for (int i = 0; i < n; i++) {
        JsonObject net = networks.add<JsonObject>();
        net["ssid"] = WiFi.SSID(i);
        net["rssi"] = WiFi.RSSI(i);
        net["encryption"] = WiFi.encryptionType(i);
        net["channel"] = WiFi.channel(i);
        net["secure"] = WiFi.encryptionType(i) != ENC_TYPE_NONE;
    }

    doc["count"] = n;
    sendJSONResponse(200, doc);

    WiFi.scanDelete();
}

void handleAPIWiFiSaved() {
    JsonDocument doc;
    JsonArray arr = doc["savedNetworks"].to<JsonArray>();

    WiFiNetwork networks[10];
    uint8_t count = 0;
    if (loadWiFiNetworks(networks, count, 10)) {
        for (uint8_t i = 0; i < count; i++) {
            JsonObject net = arr.add<JsonObject>();
            net["ssid"] = networks[i].ssid;
            net["priority"] = networks[i].priority;
            net["autoConnect"] = networks[i].autoConnect;
            net["hidden"] = networks[i].hidden;
            net["lastConnected"] = networks[i].lastConnected;
            net["failCount"] = networks[i].failCount;
        }
    }

    doc["count"] = count;
    sendJSONResponse(200, doc);
}

void handleAPIWiFiConnect() {
    // Try to parse JSON body first
    JsonDocument jsonDoc;
    parseJSONBody(jsonDoc);

    if (!hasArg("ssid", &jsonDoc)) {
        sendErrorResponse(400, "Missing ssid parameter");
        return;
    }

    String ssid = getArg("ssid", &jsonDoc);
    String password = getArg("password", &jsonDoc);

    // Try to connect using WiFiManager
    int result = connectToNetworkWithResult(ssid, password, 15000);

    if (result == WIFI_CONNECT_SUCCESS) {
        JsonDocument doc = createSuccessResponse("Connected to " + ssid);
        doc["ip"] = WiFi.localIP().toString();
        doc["ssid"] = ssid;
        sendJSONResponse(200, doc);
    } else {
        JsonDocument doc = createErrorResponse(getWiFiErrorString(result));
        sendJSONResponse(400, doc);
    }
}

void handleAPIWiFiSave() {
    JsonDocument jsonDoc;
    parseJSONBody(jsonDoc);

    if (!hasArg("ssid", &jsonDoc) || !hasArg("password", &jsonDoc)) {
        sendErrorResponse(400, "Missing ssid or password parameter");
        return;
    }

    String ssid = getArg("ssid", &jsonDoc);
    String password = getArg("password", &jsonDoc);
    uint8_t priority = hasArg("priority", &jsonDoc) ? getArg("priority", &jsonDoc).toInt() : 255;
    bool autoConnect = !hasArg("autoConnect", &jsonDoc) || getArg("autoConnect", &jsonDoc) == "true";
    bool hidden = hasArg("hidden", &jsonDoc) && getArg("hidden", &jsonDoc) == "true";

    WiFiNetwork network;
    network.ssid = ssid;
    network.password = password;
    network.priority = priority;
    network.autoConnect = autoConnect;
    network.hidden = hidden;

    if (addWiFiNetwork(network)) {
        JsonDocument doc = createSuccessResponse("Network saved: " + ssid);
        doc["ssid"] = ssid;
        doc["priority"] = network.priority;
        sendJSONResponse(201, doc);
    } else {
        JsonDocument doc = createErrorResponse("Failed to save network (max reached or duplicate)");
        sendJSONResponse(400, doc);
    }
}

void handleAPIWiFiUpdate() {
    JsonDocument jsonDoc;
    parseJSONBody(jsonDoc);

    if (!hasArg("ssid", &jsonDoc) || !hasArg("password", &jsonDoc)) {
        sendErrorResponse(400, "Missing ssid or password parameter");
        return;
    }

    String ssid = getArg("ssid", &jsonDoc);
    String password = getArg("password", &jsonDoc);
    uint8_t priority = hasArg("priority", &jsonDoc) ? getArg("priority", &jsonDoc).toInt() : 255;
    bool autoConnect = !hasArg("autoConnect", &jsonDoc) || getArg("autoConnect", &jsonDoc) == "true";
    bool hidden = hasArg("hidden", &jsonDoc) && getArg("hidden", &jsonDoc) == "true";

    WiFiNetwork network;
    network.ssid = ssid;
    network.password = password;
    network.priority = priority;
    network.autoConnect = autoConnect;
    network.hidden = hidden;

    if (updateWiFiNetwork(ssid, network)) {
        JsonDocument doc = createSuccessResponse("Network updated: " + ssid);
        sendJSONResponse(200, doc);
    } else {
        JsonDocument doc = createErrorResponse("Network not found: " + ssid);
        sendJSONResponse(404, doc);
    }
}

void handleAPIWiFiRemove() {
    JsonDocument jsonDoc;
    parseJSONBody(jsonDoc);

    if (!hasArg("ssid", &jsonDoc)) {
        sendErrorResponse(400, "Missing ssid parameter");
        return;
    }

    String ssid = getArg("ssid", &jsonDoc);

    if (removeWiFiNetwork(ssid)) {
        JsonDocument doc = createSuccessResponse("Network removed: " + ssid);
        sendJSONResponse(200, doc);
    } else {
        JsonDocument doc = createErrorResponse("Network not found: " + ssid);
        sendJSONResponse(404, doc);
    }
}

void handleAPIWiFiReconnect() {
    if (!wifiConnected() && !wifiIsAPMode()) {
        sendErrorResponse(400, "Not connected to any network");
        return;
    }

    // Force reconnection
    WiFi.disconnect();
    delay(100);

    // The WiFiManager service loop will handle reconnection
    sendSuccessResponse(200, "Reconnection initiated");
}

void handleAPIWiFiReorder() {
    if (!server.hasArg("order")) {
        sendErrorResponse(400, "Missing order parameter (JSON array of SSIDs)");
        return;
    }

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, server.arg("order"));
    if (err) {
        sendErrorResponse(400, "Invalid JSON array in order parameter");
        return;
    }

    JsonArray arr = doc.as<JsonArray>();
    uint8_t count = min<uint8_t>(arr.size(), 10);
    String order[10];

    for (uint8_t i = 0; i < count; i++) {
        order[i] = arr[i].as<String>();
    }

    if (reorderWiFiNetworks(order, count)) {
        sendSuccessResponse(200, "Network priority order updated");
    } else {
        sendErrorResponse(400, "Failed to reorder networks");
    }
}

//----------------------------------------------------
// REST API Endpoints - Device Control
//----------------------------------------------------
void handleAPIDeviceRestart() {
    sendSuccessResponse(200, "Device restarting...");
    delay(1000);
    ESP.restart();
}

void handleAPIDeviceReset() {
    // Factory reset - erase all configs
    formatStorage();
    sendSuccessResponse(200, "Factory reset complete. Device will restart.");
    delay(1000);
    ESP.restart();
}

//----------------------------------------------------
// REST API Endpoints - Telegram Config
//----------------------------------------------------
void handleAPITelegramStatus() {
    JsonDocument doc;

    TelegramConfig config;
    loadTelegramConfig(config);

    if (telegramConfigured()) {
        doc["configured"] = true;
        doc["enabled"] = config.enabled;
        doc["hasToken"] = true;
        doc["hasChatId"] = true;
    } else {
        doc["configured"] = false;
        doc["enabled"] = false;
        doc["hasToken"] = false;
        doc["hasChatId"] = false;
    }

    // Don't expose actual token/chat_id for security
    sendJSONResponse(200, doc);
}

void handleAPITelegramSave() {
    JsonDocument jsonDoc;
    parseJSONBody(jsonDoc);

    if (!hasArg("botToken", &jsonDoc) || !hasArg("chatId", &jsonDoc)) {
        sendErrorResponse(400, "Missing botToken or chatId parameter");
        return;
    }

    String botToken = getArg("botToken", &jsonDoc);
    String chatId = getArg("chatId", &jsonDoc);
    bool enabled = !hasArg("enabled", &jsonDoc) || getArg("enabled", &jsonDoc) == "true";

    if (botToken.length() == 0 || chatId.length() == 0) {
        sendErrorResponse(400, "botToken and chatId cannot be empty");
        return;
    }

    TelegramConfig config;
    config.botToken = botToken;
    config.chatId = chatId;
    config.enabled = enabled;

    if (saveTelegramConfig(config)) {
        reloadTelegramConfig(); // Force reload

        // Also update AlertConfig to enable/disable Telegram alerts
        AlertConfig alertConfig;
        loadAlertConfig(alertConfig);
        alertConfig.telegramEnabled = enabled;
        saveAlertConfig(alertConfig);

        sendSuccessResponse(200, "Telegram configuration saved");
    } else {
        sendErrorResponse(500, "Failed to save Telegram configuration");
    }
}

void handleAPITelegramTest() {
    if (!telegramConfigured()) {
        sendErrorResponse(400, "Telegram not configured");
        return;
    }

    // Send test message
    if (sendInformation("CTN Test Message - Telegram is working!")) {
        sendSuccessResponse(200, "Test message sent successfully");
    } else {
        sendErrorResponse(500, "Failed to send test message - check WiFi");
    }
}
