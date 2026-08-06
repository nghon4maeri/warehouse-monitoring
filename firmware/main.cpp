#include <Arduino.h>
#include <WiFi.h>

const char* ssid = "Wokwi-GUEST";
const char* password = "";

const char* host = "www.example.com";
const int port = 80;
const char* request = "/";

void sendRequest() {
  WiFiClient client;
  while(!client.connect(host, port)) {
    Serial.println("connection fail");
    delay(1000);
  }
  client.print(String("GET ") + request + " HTTP/1.1\r\n"
              + "Host: " + host + "\r\n"
              + "Connection: close\r\n\r\n");
  delay(500);

  while(client.available()) {
    String line = client.readStringUntil('\r');
    Serial.print(line);
  }
}

void wifiConnect() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected!");
}

void setup() {
  Serial.begin(9600);
  Serial.print("Connecting to WiFi");

  wifiConnect();
  sendRequest();
}

void loop() {
  delay(100);
}