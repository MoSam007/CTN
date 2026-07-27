#ifndef OTA_UPDATE_H
#define OTA_UPDATE_H

#include <Arduino.h>

/*************************************************
 * OTA Firmware Update Module
 * Supports both ArduinoOTA (local network) and
 * HTTP-based web upload via dashboard with WS progress
 *************************************************/

enum OTAState
{
    OTA_STATE_IDLE,
    OTA_STATE_STARTING,
    OTA_STATE_RECEIVING,
    OTA_STATE_VALIDATING,
    OTA_STATE_WRITING,
    OTA_STATE_VERIFYING,
    OTA_STATE_COMPLETE,
    OTA_STATE_ERROR
};

//--------------------------------------------------
// Public API
//--------------------------------------------------
void otaBegin();
void otaHandle();

bool otaInProgress();
OTAState otaGetState();
int otaGetProgress();              // 0-100
String otaGetError();

// Web upload handler (called from WebDashboard)
// Returns true if update started successfully
bool otaStartWebUpdate(Stream& stream, size_t contentLength);

// Check if a firmware file is valid (ESP8266 magic header)
bool otaValidateFirmware(Stream& stream, size_t length);

//--------------------------------------------------
// Callbacks (set from WebDashboard for WS progress)
//--------------------------------------------------
typedef void (*OTAProgressCallback)(int progress, const char* status);
void otaSetProgressCallback(OTAProgressCallback callback);

#endif // OTA_UPDATE_H