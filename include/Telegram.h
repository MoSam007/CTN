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
// Queue
//--------------------------------------------------

void retryQueuedTelegramMessages();
uint8_t getTelegramQueueSize();
void clearTelegramQueue();

#endif