#include "ultrasonic_sensor.h"

static bool         objectPresent      = false;
static unsigned long objectPresentStart = 0;
static float         dwellTimeSec       = 0.0;

void initUltrasonic() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  Serial.println("[INIT] HC-SR04 ultrasonic sensor ready (TRIG=5, ECHO=18)");
}

float readUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 25000UL);

  if (duration == 0) {
    Serial.println("[SENSOR] HC-SR04: No echo — out of range");
    return -1.0;
  }

  float distance = (duration * 0.0343f) / 2.0f;
  updateDwellTime(distance);
  return distance;
}

void updateDwellTime(float distance_cm) {
  unsigned long now = millis();

  if (distance_cm < 15.0 && distance_cm >= 0) {
    if (!objectPresent) {
      objectPresent      = true;
      objectPresentStart = now;
      dwellTimeSec       = 0.0;
    } else {
      dwellTimeSec = (now - objectPresentStart) / 1000.0;
    }
  } else {
    if (objectPresent) {
      objectPresent = false;
      dwellTimeSec  = 0.0;
    }
  }
}

float getDwellTimeSec() {
  return dwellTimeSec;
}
