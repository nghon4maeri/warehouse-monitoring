/**
 * Smart Warehouse — ESP32 Firmware
 * ==================================
 * Wokwi Simulation for IoT Warehouse Monitoring.
 *
 * Peripherals:
 *  - HC-SR04 Ultrasonic  → Trig GPIO12, Echo GPIO13
 *  - SG90 Servo Motor    → PWM  GPIO18
 *  - Active Buzzer       →      GPIO19
 *
 * Behaviour:
 *  1. Connects to WiFi "Wokwi-GUEST".
 *  2. Connects to an MQTT broker (default: broker.hivemq.com:1883).
 *  3. Subscribes to "warehouse/actuators" for remote commands.
 *  4. Every 2 s reads distance from HC-SR04, generates a random
 *     colour label, and publishes JSON to "warehouse/sensors".
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Servo.h>

/* ─────────────────────────────────────────────
 *  Pin Assignments
 * ───────────────────────────────────────────── */
#define TRIG_PIN   12   // HC-SR04 trigger
#define ECHO_PIN   13   // HC-SR04 echo
#define SERVO_PIN  18   // SG90 servo signal
#define BUZZER_PIN 19   // Active buzzer

/* ─────────────────────────────────────────────
 *  Network & MQTT Configuration
 * ───────────────────────────────────────────── */
const char* WIFI_SSID     = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

const char* MQTT_BROKER   = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT_ID = "warehouse-esp32-001";

/* MQTT Topics */
const char* TOPIC_SENSORS   = "warehouse/sensors";
const char* TOPIC_ACTUATORS = "warehouse/actuators";

/* ─────────────────────────────────────────────
 *  Global Objects
 * ───────────────────────────────────────────── */
WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);
Servo        gateServo;

/* ─────────────────────────────────────────────
 *  State Variables
 * ───────────────────────────────────────────── */
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 2000;   // 2 seconds

bool emergencyActive = false;
bool gateOpen        = false;

int  servoClosedAngle = 0;     // gate fully shut
int  servoOpenAngle   = 90;    // gate open

/* ─────────────────────────────────────────────
 *  Forward Declarations
 * ───────────────────────────────────────────── */
void connectWiFi();
void connectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
float readUltrasonicDistance();
String randomColour();
void publishSensorData();
void handleActuatorCommand(const String& command);
void openGate();
void closeGate();
void emergencyStop();
void soundBuzzer(int durationMs);

/* ═════════════════════════════════════════════
 *  SETUP
 * ═════════════════════════════════════════════ */
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n══════════════════════════════════");
  Serial.println(" Smart Warehouse — ESP32 Firmware");
  Serial.println("══════════════════════════════════");

  /* ── Pin Modes ── */
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  /* ── Servo ── */
  gateServo.attach(SERVO_PIN);
  gateServo.write(servoClosedAngle);            // start closed
  Serial.println("[INIT] Servo attached — gate CLOSED");

  /* ── WiFi ── */
  connectWiFi();

  /* ── MQTT ── */
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  connectMQTT();

  Serial.println("[READY] Firmware initialised successfully\n");
}

/* ═════════════════════════════════════════════
 *  LOOP
 * ═════════════════════════════════════════════ */
void loop() {
  /* Keep MQTT connection alive */
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  /* Periodic sensor read & publish */
  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;
    publishSensorData();
  }
}

/* ─────────────────────────────────────────────
 *  WiFi Connection
 * ───────────────────────────────────────────── */
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s …\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected — IP: %s\n",
                  WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] FAILED — will retry in loop");
  }
}

/* ─────────────────────────────────────────────
 *  MQTT Connection & Callback
 * ───────────────────────────────────────────── */
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.printf("[MQTT] Connecting to %s:%d …\n", MQTT_BROKER, MQTT_PORT);

    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("[MQTT] Connected");
      mqttClient.subscribe(TOPIC_ACTUATORS);
      Serial.printf("[MQTT] Subscribed to %s\n", TOPIC_ACTUATORS);
    } else {
      Serial.printf("[MQTT] Failed (rc=%d) — retrying in 3 s\n",
                    mqttClient.state());
      delay(3000);
    }
  }
}

/**
 * Called whenever a message arrives on a subscribed topic.
 *
 * Expected commands (received as raw string OR JSON):
 *   "GATE_OPEN"        — rotate servo to open position
 *   "GATE_CLOSE"       — rotate servo to closed position
 *   "EMERGENCY_STOP"   — close gate + sound alarm
 *
 * JSON payloads from the backend follow the form:
 *   {"command":"gate_open", ...}
 */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  /* Null-terminate the payload */
  char buffer[256];
  unsigned int len = (length < sizeof(buffer) - 1) ? length : sizeof(buffer) - 1;
  memcpy(buffer, payload, len);
  buffer[len] = '\0';

  String message(buffer);
  message.trim();

  Serial.printf("[MQTT RX] Topic: %s  |  Payload: %s\n", topic, message.c_str());

  /* Try parsing as JSON first (backend sends {"command":"gate_open"}) */
  String command = message;

  if (message.startsWith("{")) {
    // Crude JSON extraction — sufficient for simulated environment
    int cmdStart = message.indexOf("\"command\":\"");
    if (cmdStart >= 0) {
      cmdStart += 11;                             // strlen("\"command\":\"")
      int cmdEnd = message.indexOf("\"", cmdStart);
      if (cmdEnd > cmdStart) {
        command = message.substring(cmdStart, cmdEnd);
      }
    }
  }

  command.toUpperCase();
  handleActuatorCommand(command);
}

/* ─────────────────────────────────────────────
 *  HC-SR04 Ultrasonic Distance Reading
 * ───────────────────────────────────────────── */
float readUltrasonicDistance() {
  /* Send 10 µs HIGH trigger pulse */
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  /* Measure echo pulse duration (timeout ~25 ms → ~4 m max range) */
  long duration = pulseIn(ECHO_PIN, HIGH, 25000UL);

  if (duration == 0) {
    Serial.println("[SENSOR] No echo — out of range or disconnected");
    return -1.0;
  }

  /* Speed of sound = 343 m/s → 0.0343 cm/µs (round trip → divide by 2) */
  float distance = (duration * 0.0343f) / 2.0f;
  return distance;
}

/* ─────────────────────────────────────────────
 *  Simulated Colour Detection
 * ───────────────────────────────────────────── */
String randomColour() {
  static const char* colours[] = { "RED", "BLUE", "GREEN", "NONE" };
  return colours[random(0, 4)];
}

/* ─────────────────────────────────────────────
 *  Sensor Data Publisher
 * ───────────────────────────────────────────── */
void publishSensorData() {
  float distance = readUltrasonicDistance();

  if (distance < 0) return;           // skip on read failure

  String colour = randomColour();

  /* Build compact JSON */
  char jsonBuf[128];
  snprintf(jsonBuf, sizeof(jsonBuf),
           R"({"distance":%.1f,"color":"%s"})",
           distance, colour.c_str());

  Serial.printf("[MQTT TX] %s  →  %s\n", TOPIC_SENSORS, jsonBuf);

  mqttClient.publish(TOPIC_SENSORS, jsonBuf);
}

/* ─────────────────────────────────────────────
 *  Actuator Command Handler
 * ───────────────────────────────────────────── */
void handleActuatorCommand(const String& command) {
  if (command == "GATE_OPEN") {
    openGate();
  } else if (command == "GATE_CLOSE") {
    closeGate();
  } else if (command == "EMERGENCY_STOP") {
    emergencyStop();
  } else {
    Serial.printf("[CMD] Unknown actuator command: %s\n", command.c_str());
  }
}

void openGate() {
  Serial.println("[ACTUATOR] Opening gate …");
  gateServo.write(servoOpenAngle);
  gateOpen = true;
  emergencyActive = false;
}

void closeGate() {
  Serial.println("[ACTUATOR] Closing gate …");
  gateServo.write(servoClosedAngle);
  gateOpen = false;
}

void emergencyStop() {
  Serial.println("*** EMERGENCY STOP ACTIVATED ***");
  emergencyActive = true;
  gateServo.write(servoClosedAngle);
  gateOpen = false;
  soundBuzzer(1000);          // 1 s continuous beep
}

/**
 * Pulse the active buzzer for the specified duration (ms).
 * Active buzzer only needs HIGH/LOW — no PWM frequency required.
 */
void soundBuzzer(int durationMs) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(durationMs);
  digitalWrite(BUZZER_PIN, LOW);
}
