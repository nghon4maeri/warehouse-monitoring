"""
Anomaly Data Simulator — gửi dữ liệu bất thường để test ID 6 (Discord Alert) + ID 7 (Email)
Chạy: python tools/anomaly_sim.py
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

anomalies = [
    {"name": "OVERLOAD",    "distance_cm": 10, "weight_g": 1300, "dwell": 3},
    {"name": "OVERLOAD",    "distance_cm": 8,  "weight_g": 1500, "dwell": 5},
    {"name": "SENSOR FAULT","distance_cm": -1, "weight_g": 200,  "dwell": 0},
    {"name": "SENSOR FAULT","distance_cm": 15, "weight_g": -50,  "dwell": 1},
    {"name": "NORMAL",      "distance_cm": 12, "weight_g": 300,  "dwell": 2},
    {"name": "OVERLOAD",    "distance_cm": 6,  "weight_g": 1450, "dwell": 4},
]

print("[ANOMALY SIM] Sending anomaly data every 5s...\n")

idx = 0
while True:
    a = anomalies[idx % len(anomalies)]
    idx += 1

    payload = {
        "deviceId": "STATION_01",
        "distance_cm": a["distance_cm"] + round(random.uniform(-2, 2), 1),
        "weight_g": a["weight_g"] + round(random.uniform(-30, 30), 1),
        "dwell_time_sec": a["dwell"] + round(random.uniform(0, 1), 1),
    }

    client.publish(TOPIC, json.dumps(payload))
    print(f"[{a['name']:12s}] dist={payload['distance_cm']}cm  weight={payload['weight_g']}g  dwell={payload['dwell_time_sec']}s")
    time.sleep(5)
