 #ifndef DIAGNOSTICS_H
 #define DIAGNOSTICS_H
 
 #include <Arduino.h>
 
 //----------------------------------------------------
 // Diagnostics
 //----------------------------------------------------
 
 void initialiseDiagnostics();
 void updateDiagnostics();
 
 void printDiagnostics();
 String getResetReason();
 
 uint32_t getFreeHeap();
 uint32_t getMaxFreeBlockSize();
 float getHeapFragmentation();
 uint32_t getFlashChipSize();
 uint32_t getSketchSize();
 uint32_t getFreeSketchSpace();
 
 #endif // DIAGNOSTICS_H
