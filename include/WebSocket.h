#ifndef WEBSOCKET_H
#define WEBSOCKET_H

#include <Arduino.h>

#if defined(CTN_WEBSOCKET_ENABLED) && CTN_WEBSOCKET_ENABLED

//----------------------------------------------------
// WebSocket Lifecycle
//----------------------------------------------------
void initWebSocket();
void serviceWebSocket();
void broadcastTelemetry();
void broadcastAlert(int alertType, const String& message);

#endif // CTN_WEBSOCKET_ENABLED

#endif // WEBSOCKET_H