#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <HX711.h>

#define TRIG_PIN    5
#define ECHO_PIN    18
#define LC_DOUT     32
#define LC_SCK      33
#define SERVO_PIN   19
#define BUZZER_PIN  21

int angleToDuty(int angle) {
  return map(angle, 0, 180, 3277, 6554);
}

const char* WIFI_SSID      = "Wokwi-GUEST";
const char* WIFI_PASSWORD  = "";
const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;
const char* CLIENT_ID      = "warehouse-esp32-001";
const char* TOPIC_SENSORS  = "warehouse/sensors";
const char* TOPIC_ACTUATORS = "warehouse/actuators";

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);

bool          objectPresent       = false;
unsigned long objectPresentStart  = 0;
float         dwellTimeSec        = 0.0;

HX711 loadcell;
const float CAL_SCALE = 224.0f;    // raw ÷ 224 ≈ grams

bool alarmActive = false;

unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 1000;

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
  connectMQTT();

  Serial.println("[READY]\n");
}

void loop() {
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();
  updateAlarm();

  if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = millis();
    publishSensorData();
  }
}

float readUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 25000UL);
  if (duration == 0) return -1.0;

  float dist = (duration * 0.0343f) / 2.0f;
  updateDwell(dist);
  return dist;
}

void updateDwell(float dist_cm) {
  unsigned long now = millis();
  if (dist_cm < 15.0 && dist_cm >= 0) {
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

float getDwellTimeSec() { return dwellTimeSec; }

float readWeightGrams() {
  if (!loadcell.is_ready()) return 0.0f;
  long raw = loadcell.get_units(5);
  float w = raw / CAL_SCALE;
  return (w < 0.5f) ? 0.0f : w;
}

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
  else if (cmd == "gate_open")   setServoAngle(0);     // mở cổng = về vị trí gốc
  else if (cmd == "alarm_on")    alarmOn();
  else if (cmd == "alarm_off")   alarmOff();
  else Serial.printf("[CMD] Unknown: %s\n", cmd.c_str());
}

void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s ...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500); Serial.print("."); tries++;
  }
  Serial.println(WiFi.status() == WL_CONNECTED
    ? "\n[WiFi] Connected" : "\n[WiFi] FAILED");
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    if (mqttClient.connect(CLIENT_ID)) {
      Serial.println("[MQTT] Connected");
      mqttClient.subscribe(TOPIC_ACTUATORS);
    } else {
      delay(3000);
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
  mqttClient.publish(TOPIC_SENSORS, json);
}
