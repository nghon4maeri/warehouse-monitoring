/**
 * Smart Warehouse — ESP32 Firmware v2 (Modularised)
 * ===================================================
 * Main orchestrator: WiFi + MQTT + sensor read loop.
 *
 * Modules:
 *   ultrasonic_sensor  — Nguyễn Hồ Nam
 *   loadcell_sensor    — Trần Hoàng Minh Khang
 *   actuators          — Đàng Thế Tony
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

#include "ultrasonic_sensor.h"
#include "loadcell_sensor.h"
#include "actuators.h"

/* ── Network & MQTT ── */
const char* WIFI_SSID      = "Wokwi-GUEST";
const char* WIFI_PASSWORD  = "";
const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;
const char* MQTT_CLIENT_ID = "warehouse-esp32-001";
const char* TOPIC_SENSORS   = "warehouse/sensors";
const char* TOPIC_ACTUATORS = "warehouse/actuators";

const unsigned long SENSOR_INTERVAL = 1000;  // 1 second

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);
unsigned long lastSensorRead = 0;

void connectWiFi();
void connectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void publishSensorData();

/* ═════════════════════════════════════════════
 *  SETUP
 * ═════════════════════════════════════════════ */
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n========================================");
  Serial.println(" Smart Warehouse — ESP32 Firmware v2");
  Serial.println("========================================");

  initUltrasonic();
  initLoadcell();
  initActuators();

  connectWiFi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  connectMQTT();

  Serial.println("[READY] Firmware initialised successfully\n");
}

/* ═════════════════════════════════════════════
 *  LOOP
 * ═════════════════════════════════════════════ */
void loop() {
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  updateAlarm();

  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;
    publishSensorData();
  }
}

/* ─────────────────────────────────────────────
 *  WiFi
 * ───────────────────────────────────────────── */
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s ...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500); Serial.print("."); attempts++;
  }
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("\n[WiFi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("\n[WiFi] FAILED — will retry in loop");
}

/* ─────────────────────────────────────────────
 *  MQTT
 * ───────────────────────────────────────────── */
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.printf("[MQTT] Connecting to %s:%d ...\n", MQTT_BROKER, MQTT_PORT);
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("[MQTT] Connected");
      mqttClient.subscribe(TOPIC_ACTUATORS);
      Serial.printf("[MQTT] Subscribed to %s\n", TOPIC_ACTUATORS);
    } else {
      Serial.printf("[MQTT] Failed (rc=%d) — retrying in 3 s\n", mqttClient.state());
      delay(3000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char buffer[256];
  unsigned int len = (length < sizeof(buffer) - 1) ? length : sizeof(buffer) - 1;
  memcpy(buffer, payload, len);
  buffer[len] = '\0';

  String message(buffer);
  message.trim();
  Serial.printf("[MQTT RX] Topic: %s  |  Payload: %s\n", topic, message.c_str());

  String command = message;
  if (message.startsWith("{")) {
    int cmdStart = message.indexOf("\"command\":\"");
    if (cmdStart >= 0) {
      cmdStart += 11;
      int cmdEnd = message.indexOf("\"", cmdStart);
      if (cmdEnd > cmdStart) command = message.substring(cmdStart, cmdEnd);
    }
  }

  handleActuatorCommand(command);
}

/* ─────────────────────────────────────────────
 *  Sensor Data Publisher
 * ───────────────────────────────────────────── */
void publishSensorData() {
  float distance = readUltrasonicDistance();
  if (distance < 0) return;

  float weight = readWeightGrams();
  float dwell  = getDwellTimeSec();

  char jsonBuf[192];
  snprintf(jsonBuf, sizeof(jsonBuf),
           R"({"deviceId":"STATION_01","distance_cm":%.1f,"weight_g":%.1f,"dwell_time_sec":%.1f})",
           distance, weight, dwell);

  Serial.printf("[MQTT TX] %s -> %s\n", TOPIC_SENSORS, jsonBuf);
  mqttClient.publish(TOPIC_SENSORS, jsonBuf);
}
