#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

/*************************************************
 * Firmware Information
 *************************************************/
#define DEVICE_NAME        "CTN-001"
#define FW_VERSION         "1.0"

/*
 * Pin Definitions
 */

// GPS
#define GPS_RX_PIN D7      // ESP8266 RX <- GPS TX  (Connect GPS TX to D6)
#define GPS_TX_PIN D6      // ESP8266 TX -> GPS RX  (Connect GPS RX to D7, often unused)

// Panic Button
#define PANIC_BUTTON_PIN D5

// GPS Baud rate - change if your module uses different rate
// Common: 9600 (default), 4800, 38400, 57600, 115200
#define GPS_BAUDRATE 9600

/*************************************************
 * Battery
 *************************************************/
#define BATTERY_PIN A0

/*************************************************
 * GPS
 *************************************************/

/*************************************************
 * WiFi - REMOVED HARDCODED CREDENTIALS
 * 
 * WiFi credentials are now stored in LittleFS via Storage module
 * See include/Storage.h for WiFiNetwork structure
 *************************************************/

// AP Mode Fallback Configuration
#define AP_SSID_PREFIX       "CTN-Setup"
#define AP_PASSWORD          "childtracker"
#define AP_MODE_SSID         "CTN-Setup"
#define AP_IP                IPAddress(192, 168, 4, 1)
#define AP_GATEWAY           IPAddress(192, 168, 4, 1)
#define AP_SUBNET            IPAddress(255, 255, 255, 0)

/*************************************************
 * Telegram - Placeholders only, loaded from LittleFS
 *************************************************/

// These are placeholders - actual values loaded from Storage
const char BOT_TOKEN_PLACEHOLDER[] = "YOUR_TELEGRAM_BOT_TOKEN";
const char CHAT_ID_PLACEHOLDER[] = "YOUR_CHAT_ID";

/*************************************************
 * Timing
 *************************************************/

const unsigned long GPS_UPDATE_INTERVAL = 1000;

const unsigned long BEHAVIOUR_INTERVAL = 5000;

// WiFi
const unsigned long WIFI_RETRY_INTERVAL = 10000;
const unsigned long WIFI_TIMEOUT = 30000;
const unsigned long WIFI_CONNECT_TIMEOUT = 15000;

const unsigned long TELEGRAM_RETRY_INTERVAL = 15000;

// Background WiFi scan interval (minutes)
const unsigned long WIFI_BACKGROUND_SCAN_INTERVAL = 60000;

/*************************************************
 * Behaviour Thresholds
 *************************************************/

const float NORMAL_WALK_SPEED = 4.5;

const float MAX_RUNNING_SPEED = 12.0;

const unsigned long INACTIVITY_TIME = 600000UL;

const float MOVEMENT_THRESHOLD = 20.0;

/*************************************************
 * Safe Zones - DEPRECATED: Now loaded from LittleFS
 * Only used as fallback defaults
 *************************************************/

struct Geofence
{
    double latitude;
    double longitude;
    double radius;
};

const Geofence SAFE_ZONES[] =
{
    {-1.29210,36.82190,120},
    {-1.27850,36.81080,150}
};

const uint8_t SAFE_ZONE_COUNT =
sizeof(SAFE_ZONES)/sizeof(SAFE_ZONES[0]);

/*************************************************
 * Battery
 *************************************************/

// Voltage divider: 220k/100k = 3.2 ratio
// ADC reference: 3.3V (NodeMCU onboard divider)
// Vbatt = ADC * 3.3 / 1024 * 3.2 = ADC * 0.0103

#define BATTERY_DIVIDER_RATIO 3.2
#define ADC_REFERENCE 3.3

#endif // CONFIG_H
