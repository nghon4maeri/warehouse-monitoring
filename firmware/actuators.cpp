#include "actuators.h"
#include <Servo.h>

static Servo gateServo;
static bool  alarmActive = false;

const int SERVO_CLOSED = 0;
const int SERVO_LIGHT  = 45;
const int SERVO_MEDIUM = 90;
const int SERVO_HEAVY  = 135;

void initActuators() {
  gateServo.attach(SERVO_PIN);
  gateServo.write(SERVO_CLOSED);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("[INIT] Servo SG90 + Buzzer ready (SERVO=19, BUZZER=21, gate CLOSED)");
}

void setServoAngle(int angle) {
  gateServo.write(angle);
  alarmActive = false;
}

void alarmOn() {
  alarmActive = true;
  digitalWrite(BUZZER_PIN, HIGH);
  Serial.println("*** ALARM ACTIVATED ***");
}

void alarmOff() {
  alarmActive = false;
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("[ACTUATOR] Alarm deactivated");
}

void updateAlarm() {
  if (!alarmActive) return;

  static unsigned long lastBeepToggle = 0;
  static bool beepState = false;
  unsigned long now = millis();

  if (now - lastBeepToggle >= 500) {
    lastBeepToggle = now;
    beepState = !beepState;
    digitalWrite(BUZZER_PIN, beepState ? HIGH : LOW);
  }
}

void handleActuatorCommand(const String& command) {
  if (command == "gate_light") {
    Serial.println("[ACTUATOR] Sorting -> LIGHT (45deg)");
    setServoAngle(SERVO_LIGHT);
  } else if (command == "gate_medium") {
    Serial.println("[ACTUATOR] Sorting -> MEDIUM (90deg)");
    setServoAngle(SERVO_MEDIUM);
  } else if (command == "gate_heavy") {
    Serial.println("[ACTUATOR] Sorting -> HEAVY (135deg)");
    setServoAngle(SERVO_HEAVY);
  } else if (command == "gate_close") {
    Serial.println("[ACTUATOR] Gate -> CLOSED (0deg)");
    setServoAngle(SERVO_CLOSED);
  } else if (command == "alarm_on") {
    alarmOn();
  } else if (command == "alarm_off") {
    alarmOff();
  } else {
    Serial.printf("[CMD] Unknown actuator command: %s\n", command.c_str());
  }
}
