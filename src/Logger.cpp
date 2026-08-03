#include "Logger.h"
#include "Config.h"

#include <LittleFS.h>
#include <ArduinoJson.h>

#define LOG_FILE_PATH       "/logs/system.log"
#define MAX_LOG_FILE_SIZE   32768  // 32 KB
#define MAX_LOG_ENTRIES     1000

static LoggerConfig g_loggerConfig;
static bool g_loggerInitialized = false;
static size_t g_logEntryCount = 0;

//----------------------------------------------------
// Internal Helpers
//----------------------------------------------------

static const char* getLevelPrefix(LogLevel level) {
    switch (level) {
        case LOG_LEVEL_ERROR:   return "ERR";
        case LOG_LEVEL_WARN:    return "WRN";
        case LOG_LEVEL_INFO:    return "INF";
        case LOG_LEVEL_DEBUG:   return "DBG";
        case LOG_LEVEL_VERBOSE: return "VRB";
        default:                return "NON";
    }
}

static const char* getLevelColor(LogLevel level) {
    if (!g_loggerConfig.colorEnabled) return "";

    switch (level) {
        case LOG_LEVEL_ERROR:   return LogColors::RED;
        case LOG_LEVEL_WARN:    return LogColors::YELLOW;
        case LOG_LEVEL_INFO:    return LogColors::GREEN;
        case LOG_LEVEL_DEBUG:   return LogColors::CYAN;
        case LOG_LEVEL_VERBOSE: return LogColors::GRAY;
        default:                return LogColors::RESET;
    }
}

static String getTimestamp() {
    if (!g_loggerConfig.timestampsEnabled) return "";

    unsigned long ms = millis();
    unsigned long seconds = ms / 1000;
    unsigned long minutes = seconds / 60;
    unsigned long hours = minutes / 60;
    unsigned long days = hours / 24;

    hours = hours % 24;
    minutes = minutes % 60;
    seconds = seconds % 60;
    ms = ms % 1000;

    char buf[24];
    if (days > 0) {
        sprintf(buf, "%lud %02lu:%02lu:%02lu.%03lu ", days, hours, minutes, seconds, ms);
    } else {
        sprintf(buf, "%02lu:%02lu:%02lu.%03lu ", hours, minutes, seconds, ms);
    }
    return String(buf);
}

static String formatMessage(LogLevel level, const char* module, const char* format, va_list args) {
    char buffer[512];
    vsnprintf(buffer, sizeof(buffer), format, args);

    String message;

    if (g_loggerConfig.timestampsEnabled) {
        message += getTimestamp();
    }

    if (g_loggerConfig.modulePrefixEnabled && module) {
        message += "[";
        message += module;
        message += "] ";
    }

    message += getLevelPrefix(level);
    message += ": ";
    message += buffer;

    return message;
}

static void writeToSerial(LogLevel level, const String& message) {
    if (level <= g_loggerConfig.serialLevel) {
        if (g_loggerConfig.colorEnabled) {
            Serial.print(getLevelColor(level));
            Serial.print(message);
            Serial.println(LogColors::RESET);
        } else {
            Serial.println(message);
        }
    }
}

// Forward declaration
static void rotateLogFile();

static void writeToFile(LogLevel level, const String& message) {
    if (level > g_loggerConfig.fileLevel) return;
    if (!LittleFS.exists(LOG_FILE_PATH)) return;

    File file = LittleFS.open(LOG_FILE_PATH, "a");
    if (!file) return;

    file.println(message);
    file.close();

    g_logEntryCount++;

    // Rotate log if too large
    if (g_logEntryCount > MAX_LOG_ENTRIES) {
        rotateLogFile();
    }
}

static void rotateLogFile() {
    if (!LittleFS.exists(LOG_FILE_PATH)) return;

    // Read current log
    File file = LittleFS.open(LOG_FILE_PATH, "r");
    if (!file) return;

    String content = file.readString();
    file.close();

    // Split into lines and keep last half
    String newContent;
    int keepFrom = g_logEntryCount / 2;
    int currentLine = 0;

    int startIdx = 0;
    while (true) {
        int newlineIdx = content.indexOf('\n', startIdx);
        if (newlineIdx == -1) break;

        currentLine++;
        if (currentLine >= keepFrom) {
            newContent += content.substring(startIdx, newlineIdx + 1);
        }
        startIdx = newlineIdx + 1;
    }

    // Write back
    file = LittleFS.open(LOG_FILE_PATH, "w");
    if (file) {
        file.print(newContent);
        file.close();
        g_logEntryCount = currentLine - keepFrom;
    }
}

static void ensureLogFile() {
    if (!LittleFS.exists("/logs")) {
        LittleFS.mkdir("/logs");
    }
    if (!LittleFS.exists(LOG_FILE_PATH)) {
        File file = LittleFS.open(LOG_FILE_PATH, "w");
        if (file) file.close();
    }
}

//----------------------------------------------------
// Public API
//----------------------------------------------------

void initialiseLogger(const LoggerConfig& config) {
    g_loggerConfig = config;
    g_loggerInitialized = true;
    g_logEntryCount = 0;

    ensureLogFile();

    // Log startup
    logInfo(LogModule::MAIN, "Logger initialized (serial: %s, file: %s)",
            getLogLevelString(config.serialLevel).c_str(),
            getLogLevelString(config.fileLevel).c_str());
}

void setLogLevel(LogLevel level) {
    g_loggerConfig.serialLevel = level;
}

LogLevel getLogLevel() {
    return g_loggerConfig.serialLevel;
}

void logMessage(LogLevel level, const char* module, const char* format, ...) {
    if (!g_loggerInitialized) return;
    if (level > g_loggerConfig.serialLevel && level > g_loggerConfig.fileLevel) return;

    va_list args;
    va_start(args, format);
    logMessageVA(level, module, format, args);
    va_end(args);
}

void logMessageVA(LogLevel level, const char* module, const char* format, va_list args) {
    if (!g_loggerInitialized) return;
    if (level > g_loggerConfig.serialLevel && level > g_loggerConfig.fileLevel) return;

    String message = formatMessage(level, module, format, args);
    writeToSerial(level, message);
    writeToFile(level, message);
}

void logError(const char* module, const char* format, ...) {
    va_list args;
    va_start(args, format);
    logMessageVA(LOG_LEVEL_ERROR, module, format, args);
    va_end(args);
}

void logWarn(const char* module, const char* format, ...) {
    va_list args;
    va_start(args, format);
    logMessageVA(LOG_LEVEL_WARN, module, format, args);
    va_end(args);
}

void logInfo(const char* module, const char* format, ...) {
    va_list args;
    va_start(args, format);
    logMessageVA(LOG_LEVEL_INFO, module, format, args);
    va_end(args);
}

void logDebug(const char* module, const char* format, ...) {
    va_list args;
    va_start(args, format);
    logMessageVA(LOG_LEVEL_DEBUG, module, format, args);
    va_end(args);
}

void logVerbose(const char* module, const char* format, ...) {
    va_list args;
    va_start(args, format);
    logMessageVA(LOG_LEVEL_VERBOSE, module, format, args);
    va_end(args);
}

void printLoggerConfig() {
    Serial.println("=== Logger Configuration ===");
    Serial.print("Serial Level: "); Serial.println(getLogLevelString(g_loggerConfig.serialLevel));
    Serial.print("File Level: "); Serial.println(getLogLevelString(g_loggerConfig.fileLevel));
    Serial.print("Timestamps: "); Serial.println(g_loggerConfig.timestampsEnabled ? "Enabled" : "Disabled");
    Serial.print("Module Prefix: "); Serial.println(g_loggerConfig.modulePrefixEnabled ? "Enabled" : "Disabled");
    Serial.print("Colors: "); Serial.println(g_loggerConfig.colorEnabled ? "Enabled" : "Disabled");
    Serial.print("Log Entries: "); Serial.println(g_logEntryCount);
    Serial.println("=============================");
}

String getLogLevelString(LogLevel level) {
    switch (level) {
        case LOG_LEVEL_NONE:      return "NONE";
        case LOG_LEVEL_ERROR:     return "ERROR";
        case LOG_LEVEL_WARN:      return "WARN";
        case LOG_LEVEL_INFO:      return "INFO";
        case LOG_LEVEL_DEBUG:     return "DEBUG";
        case LOG_LEVEL_VERBOSE:   return "VERBOSE";
        default:                  return "UNKNOWN";
    }
}