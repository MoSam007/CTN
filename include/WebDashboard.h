#ifndef WEB_DASHBOARD_H
#define WEB_DASHBOARD_H

#include <Arduino.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <WiFiManager.h>
#include <Battery.h>
#include <GPS.h>
#include <Diagnostics.h>

//----------------------------------------------------
// Web Dashboard Configuration
//----------------------------------------------------
#define WEB_DASHBOARD_PORT 80

//----------------------------------------------------
// Lifecycle
//----------------------------------------------------
void initWebDashboard();
void serviceWebDashboard();
bool isWebDashboardRunning();

//----------------------------------------------------
// REST API Endpoints - Device Status
//----------------------------------------------------
void handleAPIStatus();       // GET /api/status
void handleAPIDevice();       // GET /api/device
void handleAPIBattery();      // GET /api/battery
void handleAPIGPS();          // GET /api/gps

//----------------------------------------------------
// REST API Endpoints - WiFi
//----------------------------------------------------
void handleAPIWiFiStatus();    // GET /api/wifi/status
void handleAPIWiFiScan();      // GET /api/wifi/scan
void handleAPIWiFiSaved();     // GET /api/wifi/saved
void handleAPIWiFiConnect();   // POST /api/wifi/connect
void handleAPIWiFiSave();      // POST /api/wifi/save
void handleAPIWiFiUpdate();    // PUT /api/wifi/update
void handleAPIWiFiRemove();    // DELETE /api/wifi/remove
void handleAPIWiFiReconnect(); // POST /api/wifi/reconnect
void handleAPIWiFiReorder();   // POST /api/wifi/reorder

//----------------------------------------------------
// REST API Endpoints - Device Control
//----------------------------------------------------
void handleAPIDeviceRestart();  // POST /api/device/restart
void handleAPIDeviceReset();    // POST /api/device/reset

//----------------------------------------------------
// File Serving
//----------------------------------------------------
void serveDashboardFile(const String& path);
void handleNotFound();

#endif // WEB_DASHBOARD_H

