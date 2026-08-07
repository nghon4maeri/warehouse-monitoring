"""
MQTT Sensor Simulator — publishes random warehouse data to broker.hivemq.com
Chạy: python mqtt_sim.py
"""
import json
import time
import random
import paho.mqtt.client as mqtt

BROKER = "broker.hivemq.com"
PORT = 1883
TOPIC = "warehouse/sensors"

client = mqtt.Client()
client.connect(BROKER, PORT, 60)

print(f"[SIM] Publishing to {TOPIC} every 3s...\n")

while True:
    distance = round(random.uniform(5.0, 50.0), 1)
    weight = round(random.uniform(0, 1200), 1)
    dwell = round(random.uniform(0, 10), 1) if distance < 15 else 0.0

    payload = {
        "deviceId": "STATION_01",
        "distance_cm": distance,
        "weight_g": weight,
        "dwell_time_sec": dwell
    }

    client.publish(TOPIC, json.dumps(payload))
    print(f"[SIM] dist={distance}cm  weight={weight}g  dwell={dwell}s")
    time.sleep(3)
