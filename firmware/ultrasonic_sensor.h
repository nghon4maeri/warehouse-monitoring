#ifndef ULTRASONIC_SENSOR_H
#define ULTRASONIC_SENSOR_H

/**
 * HC-SR04 Ultrasonic Distance Sensor
 * ===================================
 * Phụ trách: Nguyễn Hồ Nam
 *
 * Đo khoảng cách bằng sóng siêu âm và tính toán dwell time
 * (thời gian vật thể nằm trong vùng trạm phân loại).
 *
 * Pin: TRIG=GPIO5, ECHO=GPIO18
 */

#include <Arduino.h>

#define TRIG_PIN 5
#define ECHO_PIN 18

void  initUltrasonic();
float readUltrasonicDistance();
float getDwellTimeSec();
void  updateDwellTime(float distance_cm);

#endif
