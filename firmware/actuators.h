#ifndef ACTUATORS_H
#define ACTUATORS_H

/**
 * Actuators — Servo SG90 + Active Buzzer
 * =======================================
 * Phụ trách: Đàng Thế Tony
 *
 * Điều khiển Servo gạt hàng phân loại (4 góc: 0°/45°/90°/135°)
 * và Còi báo động (non-blocking beep pattern).
 *
 * Pin: SERVO=GPIO19, BUZZER=GPIO21
 */

#include <Arduino.h>

#define SERVO_PIN  19
#define BUZZER_PIN 21

extern const int SERVO_CLOSED;   // 0°
extern const int SERVO_LIGHT;    // 45°
extern const int SERVO_MEDIUM;   // 90°
extern const int SERVO_HEAVY;    // 135°

void initActuators();
void setServoAngle(int angle);
void alarmOn();
void alarmOff();
void updateAlarm();
void handleActuatorCommand(const String& command);

#endif
