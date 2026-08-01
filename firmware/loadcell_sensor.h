#ifndef LOADCELL_SENSOR_H
#define LOADCELL_SENSOR_H

/**
 * Loadcell 1kg + HX711 — Weight Sensor
 * ======================================
 * Phụ trách: Trần Hoàng Minh Khang
 *
 * Đọc khối lượng hàng hóa (gram) thông qua mạch HX711.
 * Hiệu chuẩn calibration factor được cài đặt trong .cpp.
 *
 * Pin: DOUT=GPIO32, SCK=GPIO33
 */

#include <Arduino.h>

#define LOADCELL_DOUT 32
#define LOADCELL_SCK  33

void  initLoadcell();
float readWeightGrams();

#endif
