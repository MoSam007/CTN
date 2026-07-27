#include "OTAUpdate.h"

#include <LittleFS.h>
#include <Updater.h>
#include <ESP8266WiFi.h>

static OTAState _otaState = OTA_STATE_IDLE;
static int _otaProgress = 0;
static String _otaError = "";
static OTAProgressCallback _otaCallback = nullptr;
static size_t _otaContentLength = 0;
static size_t _otaWritten = 0;

static uint8_t _firmwareHeader[4] = {0};
static bool _headerRead = false;

//----------------------------------------------------
// Public API
//----------------------------------------------------

void otaBegin() {
    _otaState = OTA_STATE_IDLE;
    _otaProgress = 0;
    _otaError = "";
    _otaCallback = nullptr;
    _otaContentLength = 0;
    _otaWritten = 0;
    _headerRead = false;
    Serial.println("OTA Update module initialized");
}

void otaHandle() {
    // Nothing to do in loop - async handled by web server
}

bool otaInProgress() {
    return _otaState == OTA_STATE_RECEIVING ||
           _otaState == OTA_STATE_VALIDATING ||
           _otaState == OTA_STATE_WRITING ||
           _otaState == OTA_STATE_VERIFYING;
}

OTAState otaGetState() {
    return _otaState;
}

int otaGetProgress() {
    return _otaProgress;
}

String otaGetError() {
    return _otaError;
}

void otaSetProgressCallback(OTAProgressCallback callback) {
    _otaCallback = callback;
}

// Check if firmware has valid ESP8266 magic header
bool otaValidateFirmware(Stream& stream, size_t length) {
    if (length < 4) return false;

    // ESP8266 firmware magic: 0xE9
    uint8_t header[4];
    size_t read = stream.readBytes(header, 4);
    if (read != 4) return false;

    // Check magic byte
    if (header[0] != 0xE9) return false;

    // Save header for later write
    memcpy(_firmwareHeader, header, 4);
    _headerRead = true;
    return true;
}

bool otaStartWebUpdate(Stream& stream, size_t contentLength) {
    // Validate firmware first
    if (!otaValidateFirmware(stream, contentLength)) {
        _otaError = "Invalid firmware header (not ESP8266 binary)";
        _otaState = OTA_STATE_ERROR;
        if (_otaCallback) _otaCallback(0, _otaError.c_str());
        return false;
    }

    _otaContentLength = contentLength;
    _otaWritten = 0;
    _otaState = OTA_STATE_RECEIVING;
    _otaProgress = 0;
    _otaError = "";

    if (_otaCallback) _otaCallback(0, "Starting OTA update...");

    // Begin OTA update
    if (!Update.begin(contentLength)) {
        _otaError = "Update.begin() failed: " + String(Update.getError());
        _otaState = OTA_STATE_ERROR;
        if (_otaCallback) _otaCallback(0, _otaError.c_str());
        return false;
    }

    _otaState = OTA_STATE_WRITING;
    if (_otaCallback) _otaCallback(5, "Writing firmware...");

    // Write the saved header first
    size_t written = Update.write(_firmwareHeader, 4);
    if (written != 4) {
        _otaError = "Failed to write header";
        Update.end(false);
        _otaState = OTA_STATE_ERROR;
        if (_otaCallback) _otaCallback(0, _otaError.c_str());
        return false;
    }
    _otaWritten = 4;

    // Stream the rest of the firmware to Update
    uint8_t buffer[2048];
    while (_otaWritten < contentLength) {
        size_t available = stream.available();
        if (available > 0) {
            size_t toRead = min<size_t>(available, sizeof(buffer));
            size_t read = stream.readBytes(buffer, toRead);
            if (read > 0) {
                size_t writtenNow = Update.write(buffer, read);
                if (writtenNow != read) {
                    _otaError = "Write failed: " + String(Update.getError());
                    Update.end(false);
                    _otaState = OTA_STATE_ERROR;
                    if (_otaCallback) _otaCallback(0, _otaError.c_str());
                    return false;
                }
                _otaWritten += writtenNow;
                _otaProgress = (_otaContentLength > 0) ? (100.0 * _otaWritten / _otaContentLength) : 0;
                if (_otaCallback) {
                    char progressMsg[32];
                    snprintf(progressMsg, sizeof(progressMsg), "Writing: %d%%", _otaProgress);
                    _otaCallback(_otaProgress, progressMsg);
                }
            }
        } else {
            delay(1);
        }
    }

    _otaState = OTA_STATE_VERIFYING;
    if (_otaCallback) _otaCallback(90, "Verifying firmware...");

    if (!Update.end(true)) {
        _otaError = "Update.end() failed: " + String(Update.getError());
        _otaState = OTA_STATE_ERROR;
        if (_otaCallback) _otaCallback(0, _otaError.c_str());
        return false;
    }

    if (!Update.isFinished()) {
        _otaError = "Update not finished properly";
        _otaState = OTA_STATE_ERROR;
        if (_otaCallback) _otaCallback(0, _otaError.c_str());
        return false;
    }

    _otaState = OTA_STATE_COMPLETE;
    _otaProgress = 100;
    if (_otaCallback) _otaCallback(100, "Update complete, rebooting...");

    Serial.println("OTA update successful, rebooting...");
    delay(500);
    ESP.restart();

    return true; // Never reached
}