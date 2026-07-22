#ifndef OTA_H
#define OTA_H

#include <Arduino.h>

/*************************************************
 * OTA Module - HTTPS OTA Updates with Rollback
 *************************************************/

// OTA States
enum OTAState {
    OTA_IDLE,
    OTA_CHECKING_VERSION,
    OTA_DOWNLOADING,
    OTA_VERIFYING,
    OTA_APPLYING,
    OTA_SUCCESS,
    OTA_FAILED,
    OTA_ROLLBACK
};

// OTA Configuration
struct OTAConfig {
    bool enabled;
    bool autoCheck;
    bool autoUpdate;
    String serverUrl;           // Base URL for OTA server
    String versionEndpoint;     // Endpoint to check version
    String firmwareEndpoint;    // Endpoint to download firmware
    String currentVersion;      // Current firmware version
    unsigned long checkInterval; // Hours between version checks
    uint8_t maxRetries;
    unsigned long retryInterval;
    bool verifySignature;       // Verify firmware signature
    String publicKey;           // Public key for signature verification
    bool rollbackEnabled;       // Enable automatic rollback on failure
    
    OTAConfig() : enabled(true), autoCheck(true), autoUpdate(false),
                  serverUrl("https://ota.example.com"),
                  versionEndpoint("/api/v1/firmware/latest"),
                  firmwareEndpoint("/api/v1/firmware/download"),
                  currentVersion("1.0.0"),
                  checkInterval(24), maxRetries(3), retryInterval(30000),
                  verifySignature(false), rollbackEnabled(true) {}
};

// OTA Status/Progress
struct OTAStatus {
    OTAState state;
    float progress;           // 0.0 - 100.0
    String currentVersion;
    String availableVersion;
    String errorMessage;
    unsigned long startTime;
    unsigned long bytesWritten;
    unsigned long totalBytes;
    bool rollbackAvailable;
    
    OTAStatus() : state(OTA_IDLE), progress(0), bytesWritten(0), totalBytes(0), rollbackAvailable(false) {}
};

// Cross-module dependencies (defined in WiFiManager.cpp, Telegram.cpp, etc.)
extern bool wifiConnected();
extern bool telegramConfigured();
extern String getMACAddress();
extern bool sendFirmwareUpdateAlert(const String& version, bool success);

//----------------------------------------------------
// Initialisation
//----------------------------------------------------
void initialiseOTA();
void serviceOTA();  // Call from main loop

//----------------------------------------------------
// Version Checking
//----------------------------------------------------
bool checkForUpdate();                          // Check server for new version
bool checkForUpdateWithResult(String& availableVersion, String& downloadUrl, String& releaseNotes);
String getCurrentVersion();
void setCurrentVersion(const String& version);

//----------------------------------------------------
// Update Process
//----------------------------------------------------
bool startOTAUpdate();                          // Start download and apply
bool startOTAUpdateFromUrl(const String& url);  // Start from specific URL
void cancelOTAUpdate();                         // Cancel ongoing update

// Progress callback type
typedef void (*OTAProgressCallback)(float progress, const String& status);
void setOTAProgressCallback(OTAProgressCallback callback);

//----------------------------------------------------
// Status & Configuration
//----------------------------------------------------
OTAStatus getOTAStatus();
OTAConfig getOTAConfig();
bool loadOTAConfig(OTAConfig& config);
bool saveOTAConfig(const OTAConfig& config);

//----------------------------------------------------
// Rollback
//----------------------------------------------------
bool rollbackToPrevious();  // Rollback to previous firmware
bool hasRollbackAvailable();

//----------------------------------------------------
// Server Communication
//----------------------------------------------------
bool sendOTAStatusToServer(const String& status, const String& version, float progress);
bool registerDeviceWithOTAServer();

//----------------------------------------------------
// Utilities
//----------------------------------------------------
void printOTAStatus();

#endif // OTA_H
