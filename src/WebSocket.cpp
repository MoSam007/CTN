#include "WebSocket.h"
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
#include "Logger.h"

#if defined(CTN_WEBSOCKET_ENABLED) && CTN_WEBSOCKET_ENABLED

#include <LittleFS.h>
#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

#ifdef ESP8266
#include <ESPAsyncTCP.h>
#else
#include <AsyncTCP.h>
#endif

#include "WebDashboard.h"

//----------------------------------------------------
// WebSocket Implementation
//----------------------------------------------------
static AsyncWebServer asyncServer(WEB_DASHBOARD_PORT + 1);
static AsyncWebSocket ws("/ws");
static bool asyncServerRunning = false;
static unsigned long lastTelemetryBroadcast = 0;

// Forward declarations from WebDashboard
extern void serveDashboardFile(const String& path);
extern bool handleFileRead(const String& path);

//----------------------------------------------------
// WebSocket Event Handler
//----------------------------------------------------
void handleWebSocketEvent(AsyncWebSocket* srv, AsyncWebSocketClient* client,
                          AwsEventType type, void* arg, uint8_t* data, size_t len) {
    switch (type) {
        case WS_EVT_CONNECT:
            LOG_INFO(LogModule::WEB, "WebSocket client connected: %u", client->id());
            break;
        case WS_EVT_DISCONNECT:
            LOG_INFO(LogModule::WEB, "WebSocket client disconnected: %u", client->id());
            break;
        case WS_EVT_DATA:
            // Handle WebSocket messages if needed
            break;
        case WS_EVT_PONG:
        case WS_EVT_ERROR:
            break;
    }
}

//----------------------------------------------------
// Initialize WebSocket Server
//----------------------------------------------------
void initWebSocket() {
    ws.onEvent(handleWebSocketEvent);
    asyncServer.addHandler(&ws);

    asyncServer.begin();
    asyncServerRunning = true;

    // Set OTA progress callback for WebSocket updates
    otaSetProgressCallback([](int progress, const char* message) {
        JsonDocument doc;
        doc["type"] = "otaProgress";
        doc["progress"] = progress;
        doc["message"] = message;
        String json;
        serializeJson(doc, json);
        ws.textAll(json);
    });

    LOG_INFO(LogModule::WEB, "WebSocket server started on port %d", WEB_DASHBOARD_PORT + 1);
}

//----------------------------------------------------
// Service WebSocket (cleanup disconnected clients)
//----------------------------------------------------
void serviceWebSocket() {
    if (asyncServerRunning) {
        ws.cleanupClients();
    }
}

//----------------------------------------------------
// Broadcast Telemetry Data
//----------------------------------------------------
void broadcastTelemetry() {
    if (!asyncServerRunning || ws.count() == 0) return;

    unsigned long now = millis();
    if (now - lastTelemetryBroadcast < 1000) return; // Limit to 1Hz
    lastTelemetryBroadcast = now;

    JsonDocument doc;
    doc["type"] = "telemetry";

    // Device status
    doc["device"]["uptime"] = millis();
    doc["device"]["freeHeap"] = ESP.getFreeHeap();
    doc["device"]["wifiRSSI"] = getRSSI();
    doc["device"]["wifiSSID"] = getSSID();

    // Battery
    doc["battery"]["voltage"] = getBatteryVoltage();
    doc["battery"]["percentage"] = getBatteryPercentage();
    doc["battery"]["state"] = (int)getBatteryState();
    doc["battery"]["charging"] = batteryLow() ? false : true; // Simplified

    // GPS
    doc["gps"]["latitude"] = getLatitude();
    doc["gps"]["longitude"] = getLongitude();
    doc["gps"]["speed"] = getSpeed();
    doc["gps"]["altitude"] = getAltitude();
    doc["gps"]["satellites"] = getSatelliteCount();
    doc["gps"]["fix"] = gpsHasFix();
    doc["gps"]["hdop"] = getHDOP();

    // Behaviour
    doc["behaviour"]["state"] = behaviourStateToString(getBehaviourState());
    doc["behaviour"]["riskScore"] = getRiskScore();
    doc["behaviour"]["speed"] = getSpeed();
    doc["behaviour"]["distance"] = 0; // Would need to track cumulative distance

    String json;
    serializeJson(doc, json);
    ws.textAll(json);
}

//----------------------------------------------------
// Broadcast Alert
//----------------------------------------------------
void broadcastAlert(int alertType, const String& message) {
    if (!asyncServerRunning || ws.count() == 0) return;

    JsonDocument doc;
    doc["type"] = "alert";
    doc["alertType"] = alertType;
    doc["message"] = message;
    doc["timestamp"] = millis();

    String json;
    serializeJson(doc, json);
    ws.textAll(json);
}

#endif // CTN_WEBSOCKET_ENABLED