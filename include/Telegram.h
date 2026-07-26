#ifndef TELEGRAM_H
#define TELEGRAM_H

#include <Arduino.h>

//--------------------------------------------------
// Initialisation
//--------------------------------------------------

void initialiseTelegram();

//--------------------------------------------------
// Configuration & Status
//--------------------------------------------------

bool telegramConfigured();
void reloadTelegramConfig();  // Force reload from storage

//--------------------------------------------------
// Alert Functions
//--------------------------------------------------

bool sendTelegramMessage(const String& message);

bool sendEmergencyAlert(
    const String& title,
    const String& description);

bool sendInformation(
    const String& message);

//--------------------------------------------------
// Required Alert Format Functions (prefixed to avoid conflicts)
//--------------------------------------------------

bool telegramSendPanicAlert(const String& latitude, const String& longitude, const String& googleMapsLink, uint8_t batteryPercent, const String& deviceName);

bool telegramSendLowBatteryAlert(uint8_t batteryPercent);

bool telegramSendSafeArrivalAlert(const String& zoneName, const String& timeStr, uint8_t batteryPercent, const String& latitude, const String& longitude);

bool telegramSendBehaviourAlert(const String& description, const String& riskLevel, const String& recommendation, const String& latitude, const String& longitude);

//--------------------------------------------------
// Queue
//--------------------------------------------------

void retryQueuedTelegramMessages();
uint8_t getTelegramQueueSize();
void clearTelegramQueue();

#endif