// ============================================================
// Smart Warehouse — ESP32 Firmware (Optimized Version)
// Nguyễn Hồ Nam / Trần Hoàng Minh Khang / Đàng Thế Tony
// ============================================================

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <HX711.h>

/* ========== Pin Definitions ========== */
#define TRIG_PIN    5
#define ECHO_PIN    18
#define LC_DOUT     32
#define LC_SCK      33
#define SERVO_PIN   19
#define BUZZER_PIN  21

/* ========== Servo PWM (50Hz, 16-bit, 0-180°) ========== */
int angleToDuty(int angle) {
  return map(angle, 0, 180, 3277, 6554);
}

/* ========== Network & MQTT ========== */
const char* WIFI_SSID      = "Wokwi-GUEST";
const char* WIFI_PASSWORD  = "";
const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;
const char* CLIENT_ID      = "warehouse-esp32-001";
const char* TOPIC_SENSORS  = "warehouse/sensors";
const char* TOPIC_ACTUATORS = "warehouse/actuators";

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);

/* ========== Ultrasonic State ========== */
bool          objectPresent       = false;
unsigned long objectPresentStart  = 0;
float         dwellTimeSec        = 0.0;

/* ========== Loadcell ========== */
HX711 loadcell;
float calScale    = 224.0f;
bool  calibrated  = false;

/* ========== Buzzer ========== */
bool alarmActive = false;

/* ========== Timer & Reconnect ========== */
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 3000;
unsigned long lastMqttRetry  = 0; // [OPTIMIZED] Timer hỗ trợ reconnect non-blocking

/* ========== [OPTIMIZED] EMA Filter Parameters ========== */
float emaDistance = 0.0f;
float emaWeight   = 0.0f;
const float EMA_ALPHA = 0.35f; // Hệ số làm mượt tín hiệu (0.1 - 0.5)

float applyEMA(float currentVal, float prevFiltered) {
  if (prevFiltered <= 0.0f) return currentVal;
  return (EMA_ALPHA * currentVal) + ((1.0f - EMA_ALPHA) * prevFiltered);
}

/* ============================================================
 *  SETUP
 * ============================================================ */
void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  ledcAttach(SERVO_PIN, 50, 16);
  ledcWrite(SERVO_PIN, angleToDuty(0));

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  loadcell.begin(LC_DOUT, LC_SCK);
  loadcell.set_scale();
  delay(200);
  loadcell.tare();

  connectWiFi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  Serial.println("[READY] ESP32 Ready with EMA Filter & Non-blocking MQTT\n");
}

/* ============================================================
 *  LOOP
 * ============================================================ */
void loop() {
  // [OPTIMIZED] Kiểm tra kết nối MQTT không-chặn (Non-blocking)
  checkMQTTConnection();
  mqttClient.loop();
  updateAlarm();

  if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = millis();
    publishSensorData();
  }
}

/* ==================== ULTRASONIC HC-SR04 ==================== */

float readUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 25000UL);
  if (duration == 0) return -1.0f;

  float rawDist = (duration * 0.0343f) / 2.0f;

  // [OPTIMIZED] Lọc nhiễu khoảng cách bằng EMA
  emaDistance = applyEMA(rawDist, emaDistance);

  updateDwell(emaDistance);
  return emaDistance;
}

void updateDwell(float dist_cm) {
  unsigned long now = millis();
  if (dist_cm < 15.0f && dist_cm >= 0) {
    if (!objectPresent) {
      objectPresent      = true;
      objectPresentStart = now;
      dwellTimeSec       = 0.0f;
    } else {
      dwellTimeSec = (now - objectPresentStart) / 1000.0f;
    }
  } else {
    if (objectPresent) {
      objectPresent = false;
      dwellTimeSec  = 0.0f;
    }
  }
}

float getDwellTimeSec() { return dwellTimeSec; }

/* ==================== LOADCELL HX711 ==================== */

float readWeightGrams() {
  if (!loadcell.is_ready()) return emaWeight; // [OPTIMIZED] Trả về giá trị lọc cũ nếu phần cứng bận
  long raw = loadcell.get_units(3); // [OPTIMIZED] Giảm mẫu đọc xuống 3 để tránh trễ chu kỳ
  float w = raw / calScale;

  // Auto-calibrate: nếu kéo slider max (>5000g), tự tính scale
  if (w > 5500.0f && !calibrated) {
    calScale = raw / 5000.0f;
    calibrated = true;
    Serial.printf("[CAL] Scale adjusted to %.1f (raw=%ld → 5000g)\n", calScale, raw);
    w = 5000.0f;
  }

  // [OPTIMIZED] Khử trôi điểm 0 (Zero-drift tolerance)
  if (w < 1.0f) w = 0.0f;

  // [OPTIMIZED] Lọc nhiễu khối lượng bằng EMA
  emaWeight = applyEMA(w, emaWeight);
  return emaWeight;
}

/* ==================== ACTUATORS ==================== */

void setServoAngle(int angle) {
  ledcWrite(SERVO_PIN, angleToDuty(angle));
  alarmActive = false;
}

void alarmOn()  { alarmActive = true;  digitalWrite(BUZZER_PIN, HIGH); }
void alarmOff() { alarmActive = false; digitalWrite(BUZZER_PIN, LOW);  }

void updateAlarm() {
  if (!alarmActive) return;
  static unsigned long lastToggle = 0;
  static bool beep = false;
  if (millis() - lastToggle >= 500) {
    lastToggle = millis();
    beep = !beep;
    digitalWrite(BUZZER_PIN, beep ? HIGH : LOW);
  }
}

void handleCommand(const String& cmd) {
  if      (cmd == "gate_light")  setServoAngle(45);
  else if (cmd == "gate_medium") setServoAngle(90);
  else if (cmd == "gate_heavy")  setServoAngle(135);
  else if (cmd == "gate_close")  setServoAngle(0);
  else if (cmd == "gate_open")   setServoAngle(0);
  else if (cmd == "alarm_on")    alarmOn();
  else if (cmd == "alarm_off")   alarmOff();
}

/* ==================== WiFi ==================== */

void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s ...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500); Serial.print("."); tries++;
  }
  Serial.println(WiFi.status() == WL_CONNECTED
    ? "\n[WiFi] Connected" : "\n[WiFi] FAILED — Running offline mode");
}

/* ==================== MQTT ==================== */

// [OPTIMIZED] Reconnect MQTT không làm đóng băng chương trình
void checkMQTTConnection() {
  if (mqttClient.connected()) return;

  unsigned long now = millis();
  if (now - lastMqttRetry >= 5000) {
    lastMqttRetry = now;
    Serial.print("[MQTT] Connecting to broker...");
    if (mqttClient.connect(CLIENT_ID)) {
      Serial.println(" CONNECTED");
      mqttClient.subscribe(TOPIC_ACTUATORS);
    } else {
      Serial.printf(" FAILED (rc=%d), retry in 5s\n", mqttClient.state());
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char buf[256];
  unsigned int len = min(length, (unsigned int)(sizeof(buf) - 1));
  memcpy(buf, payload, len);
  buf[len] = '\0';
  String msg(buf);
  msg.trim();

  String cmd = msg;
  if (msg.startsWith("{")) {
    int s = msg.indexOf("\"command\":\"");
    if (s >= 0) {
      s += 11;
      int e = msg.indexOf("\"", s);
      if (e > s) cmd = msg.substring(s, e);
    }
  }
  handleCommand(cmd);
}

/* ==================== PUBLISH ==================== */

void publishSensorData() {
  float dist = readUltrasonicDistance();
  if (dist < 0) return;

  float w = readWeightGrams();
  float d = getDwellTimeSec();

  char json[192];
  snprintf(json, sizeof(json),
    R"({"deviceId":"STATION_01","distance_cm":%.1f,"weight_g":%.1f,"dwell_time_sec":%.1f})",
    dist, w, d);

  Serial.printf("[MQTT TX] %s\n", json);
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_SENSORS, json);
  }
}