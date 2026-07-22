#ifndef AP_DASHBOARD_H
#define AP_DASHBOARD_H

#include <Arduino.h>

/*************************************************
 * AP Dashboard Module
 * Initializes and manages the Access Point mode configuration portal
 *************************************************/

//----------------------------------------------------
// Initialisation
//----------------------------------------------------
bool startAPDashboard(const char* apSSID = "CTN-Setup", const char* apPass = "childtracker");
void stopAPDashboard();
bool isAPDashboardActive();

//----------------------------------------------------
// Status
//----------------------------------------------------
String getAPDashboardURL();
String getAPDashboardIP();

#endif // AP_DASHBOARD_H