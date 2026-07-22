#include "Telegram.h"

#include "Config.h"
#include "GPS.h"
#include "WiFiManager.h"
#include "Storage.h"
#include "Logger.h"

#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>

//--------------------------------------------------
// Static config loaded from Storage
//--------------------------------------------------
static TelegramConfig telegramConfig;
static bool telegramConfigLoaded = false;

//--------------------------------------------------
// Telegram Message Queue (for retry when WiFi unavailable)
//--------------------------------------------------
#define MAX_TELEGRAM_QUEUE 10

struct QueuedTelegramMessage {
    String message;
    unsigned long timestamp;
    uint8_t retryCount;
    bool isEmergency;
};

static QueuedTelegramMessage telegramQueue[MAX_TELEGRAM_QUEUE];
static uint8_t telegramQueueCount = 0;
static unsigned long lastTelegramRetry = 0;

bool telegramConfigured() {
    if (!telegramConfigLoaded) {
        telegramConfigLoaded = loadTelegramConfig(telegramConfig);
    }
    return telegramConfig.enabled && telegramConfig.botToken.length() > 0 && telegramConfig.chatId.length() > 0;
}

static bool enqueueTelegramMessage(const String& message, bool isEmergency) {
    if (telegramQueueCount >= MAX_TELEGRAM_QUEUE) {
        // Remove oldest non-emergency message to make room
        for (uint8_t i = 0; i < telegramQueueCount - 1; i++) {
            if (!telegramQueue[i].isEmergency) {
                for (uint8_t j = i; j < telegramQueueCount - 1; j++) {
                    telegramQueue[j] = telegramQueue[j + 1];
                }
                telegramQueueCount--;
                break;
            }
        }
        if (telegramQueueCount >= MAX_TELEGRAM_QUEUE) {
            LOG_WARN(LogModule::TELE, "Telegram queue full, dropping message");
            return false;
        }
    }

    QueuedTelegramMessage& msg = telegramQueue[telegramQueueCount++];
    msg.message = message;
    msg.timestamp = millis();
    msg.retryCount = 0;
    msg.isEmergency = isEmergency;

    LOG_DEBUG(LogModule::TELE, "Queued Telegram message (%s), queue size: %d",
              isEmergency ? "EMERGENCY" : "NORMAL", telegramQueueCount);
    return true;
}

static void processTelegramQueue() {
    if (telegramQueueCount == 0) return;
    if (!wifiConnected()) return;
    if (!telegramConfigured()) return;

    unsigned long now = millis();
    if (now - lastTelegramRetry < 5000) return; // Throttle retries
    lastTelegramRetry = now;

    for (int i = telegramQueueCount - 1; i >= 0; i--) {
        if (sendTelegramMessage(telegramQueue[i].message)) {
            // Remove from queue by shifting
            for (uint8_t j = i; j < telegramQueueCount - 1; j++) {
                telegramQueue[j] = telegramQueue[j + 1];
            }
            telegramQueueCount--;
            LOG_INFO(LogModule::TELE, "Sent queued Telegram message, remaining: %d", telegramQueueCount);
        } else {
            telegramQueue[i].retryCount++;
            if (telegramQueue[i].retryCount > 10) {
                LOG_WARN(LogModule::TELE, "Dropping Telegram message after max retries");
                for (uint8_t j = i; j < telegramQueueCount - 1; j++) {
                    telegramQueue[j] = telegramQueue[j + 1];
                }
                telegramQueueCount--;
            }
        }
    }
}

//--------------------------------------------------

void initialiseTelegram()
{
    if (telegramConfigured()) {
        Serial.println("Telegram configured and ready");
    } else {
        Serial.println("Telegram not configured - run setup via web dashboard");
    }
}

//--------------------------------------------------

bool sendTelegramMessage(const String& message)
{
    if (!wifiConnected()) {
        LOG_WARN(LogModule::TELE, "WiFi unavailable, queueing message");
        return enqueueTelegramMessage(message, false);
    }

    if (!telegramConfigured()) {
        LOG_WARN(LogModule::TELE, "Telegram not configured");
        return false;
    }

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient https;
    String url = "https://api.telegram.org/bot" + telegramConfig.botToken + "/sendMessage";

    if (!https.begin(client, url)) {
        LOG_ERROR(LogModule::TELE, "HTTPS begin failed");
        return false;
    }

    https.setTimeout(10000);
    https.addHeader("Content-Type", "application/x-www-form-urlencoded");

    String body = "chat_id=" + telegramConfig.chatId + "&text=" + message;
    int response = https.POST(body);
    https.end();

    if (response == 200) {
        LOG_INFO(LogModule::TELE, "Telegram sent successfully");
        return true;
    }

    LOG_ERROR(LogModule::TELE, "Telegram error: %d", response);
    return false;
}

//--------------------------------------------------

bool sendEmergencyAlert(const String& title, const String& description)
{
    String msg = "🚨 EMERGENCY ALERT 🚨\n\n*" + title + "*\n\n" + description + "\n\n";
    msg += "Device : " + String(DEVICE_NAME) + "\n";

    if (gpsHasFix()) {
        msg += "Latitude : " + String(getLatitude(), 6) + "\n";
        msg += "Longitude : " + String(getLongitude(), 6) + "\n";
        msg += "Speed : " + String(getSpeed(), 1) + " km/h\n\n";
        msg += getGoogleMapsLink();
    } else {
        msg += "GPS Fix Not Available";
    }

    return sendTelegramMessage(msg);
}

//--------------------------------------------------

bool sendInformation(const String& message)
{
    return sendTelegramMessage("ℹ️ " + message);
}

//--------------------------------------------------
// Public queue processing (call from main loop)
//--------------------------------------------------

void retryQueuedTelegramMessages()
{
    processTelegramQueue();
}

uint8_t getTelegramQueueSize()
{
    return telegramQueueCount;
}

void clearTelegramQueue()
{
    telegramQueueCount = 0;
}

