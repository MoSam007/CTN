#ifndef LOGGER_H
#define LOGGER_H

#include <Arduino.h>

/*************************************************
 * Logger Module - Centralized Logging System
 * Replaces raw Serial.println() calls with structured logging
 *************************************************/

enum LogLevel {
    LOG_LEVEL_NONE = 0,
    LOG_LEVEL_ERROR = 1,
    LOG_LEVEL_WARN = 2,
    LOG_LEVEL_INFO = 3,
    LOG_LEVEL_DEBUG = 4,
    LOG_LEVEL_VERBOSE = 5
};

struct LoggerConfig {
    LogLevel serialLevel;
    LogLevel fileLevel;
    bool timestampsEnabled;
    bool modulePrefixEnabled;
    bool colorEnabled;

    LoggerConfig() : serialLevel(LOG_LEVEL_INFO), fileLevel(LOG_LEVEL_DEBUG),
                     timestampsEnabled(true), modulePrefixEnabled(true), colorEnabled(false) {}
};

// Color codes for ANSI terminal support
namespace LogColors {
    inline const char* RESET = "\033[0m";
    inline const char* RED = "\033[31m";
    inline const char* YELLOW = "\033[33m";
    inline const char* GREEN = "\033[32m";
    inline const char* CYAN = "\033[36m";
    inline const char* BLUE = "\033[34m";
    inline const char* MAGENTA = "\033[35m";
    inline const char* GRAY = "\033[90m";
}

//----------------------------------------------------
// Initialisation
//----------------------------------------------------
void initialiseLogger(const LoggerConfig& config = LoggerConfig());
void setLogLevel(LogLevel level);
LogLevel getLogLevel();

//----------------------------------------------------
// Core Logging Functions
//----------------------------------------------------
void logMessage(LogLevel level, const char* module, const char* format, ...);
void logMessageVA(LogLevel level, const char* module, const char* format, va_list args);
void logError(const char* module, const char* format, ...);
void logWarn(const char* module, const char* format, ...);
void logInfo(const char* module, const char* format, ...);
void logDebug(const char* module, const char* format, ...);
void logVerbose(const char* module, const char* format, ...);

// Convenience macros for automatic module name
#define LOG_ERROR(module, ...)    logError(module, __VA_ARGS__)
#define LOG_WARN(module, ...)     logWarn(module, __VA_ARGS__)
#define LOG_INFO(module, ...)     logInfo(module, __VA_ARGS__)
#define LOG_DEBUG(module, ...)    logDebug(module, __VA_ARGS__)
#define LOG_VERBOSE(module, ...)  logVerbose(module, __VA_ARGS__)

//----------------------------------------------------
// Module Tag Constants (for consistent naming)
//----------------------------------------------------
namespace LogModule {
    constexpr const char* MAIN      = "MAIN";
    constexpr const char* GPS       = "GPS";
    constexpr const char* WIFI      = "WIFI";
    constexpr const char* BATT      = "BATT";
    constexpr const char* BEHAV     = "BEHAV";
    constexpr const char* TELE      = "TELE";
    constexpr const char* ALERTS    = "ALERT";
    constexpr const char* STORAGE   = "STOR";
    constexpr const char* OTA       = "OTA";
    constexpr const char* WEB       = "WEB";
    constexpr const char* DIAG      = "DIAG";
    constexpr const char* UTIL      = "UTIL";
    constexpr const char* DEMO      = "DEMO";
}

//----------------------------------------------------
// Utility
//----------------------------------------------------
void printLoggerConfig();
String getLogLevelString(LogLevel level);

#endif // LOGGER_H