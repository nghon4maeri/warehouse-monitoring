#include "loadcell_sensor.h"
#include <HX711.h>

static HX711 loadcell;
static const float CALIBRATION_FACTOR = -420.0;

void initLoadcell() {
  loadcell.begin(LOADCELL_DOUT, LOADCELL_SCK);
  loadcell.set_scale(CALIBRATION_FACTOR);
  delay(200);
  loadcell.tare();
  Serial.println("[INIT] HX711 loadcell calibrated & tared (DOUT=32, SCK=33)");
}

float readWeightGrams() {
  if (loadcell.is_ready()) {
    float weight = loadcell.get_units();
    return (weight < 0) ? 0.0 : weight;
  }
  return 0.0;
}
