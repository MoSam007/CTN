 #include "Diagnostics.h"
 
 //----------------------------------------------------
 // Diagnostics
 //----------------------------------------------------
 
 void initialiseDiagnostics()
 {
     Serial.println("Diagnostics Ready");
 }
 
 void updateDiagnostics()
 {
     // Nothing to update continuously
 }
 
 void printDiagnostics()
 {
     Serial.println();
     Serial.println("===== DIAGNOSTICS =====");
     Serial.print("Free Heap:        ");
     Serial.println(getFreeHeap());
     Serial.print("Max Free Block:   ");
     Serial.println(getMaxFreeBlockSize());
     Serial.print("Heap Fragmentation: ");
     Serial.print(getHeapFragmentation(), 1);
     Serial.println("%");
     Serial.print("Flash Chip Size:  ");
     Serial.println(getFlashChipSize());
     Serial.print("Sketch Size:      ");
     Serial.println(getSketchSize());
     Serial.print("Free Sketch Space: ");
     Serial.println(getFreeSketchSpace());
     Serial.print("Reset Reason:     ");
     Serial.println(getResetReason());
     Serial.println("=======================");
 }
 
 String getResetReason()
 {
     return ESP.getResetReason();
 }
 
 uint32_t getFreeHeap()
 {
     return ESP.getFreeHeap();
 }
 
 uint32_t getMaxFreeBlockSize()
 {
     return ESP.getMaxFreeBlockSize();
 }
 
 float getHeapFragmentation()
 {
     uint32_t free = ESP.getFreeHeap();
     uint32_t maxBlock = ESP.getMaxFreeBlockSize();
     if (free == 0) return 0.0;
     return (1.0 - (float)maxBlock / free) * 100.0;
 }
 
 uint32_t getFlashChipSize()
 {
     return ESP.getFlashChipSize();
 }
 
 uint32_t getSketchSize()
 {
     return ESP.getSketchSize();
 }
 
 uint32_t getFreeSketchSpace()
 {
     return ESP.getFreeSketchSpace();
 }
