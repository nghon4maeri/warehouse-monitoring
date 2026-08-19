"""
MQTT Sensor Simulator — publishes random warehouse data to broker.hivemq.com
Chạy: python mqtt_sim.py
"""
import json
import socket
import time
import random
import paho.mqtt.client as mqtt

BROKER = "broker.hivemq.com"
PORT = 1883
TOPIC = "warehouse/sensors"

# Force IPv4 to avoid IPv6 DNS issues on some networks
socket.setdefaulttimeout(10)

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
try:
    client.connect(BROKER, PORT, 60)
except Exception as e:
    print(f"[SIM] Connect failed: {e}")
    print("[SIM] Trying IPv4 directly...")
    import socket as s
    ip = s.gethostbyname(BROKER)
    client.connect(ip, PORT, 60)

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

    try:
        client.publish(TOPIC, json.dumps(payload))
        print(f"[SIM] dist={distance}cm  weight={weight}g  dwell={dwell}s")
    except Exception as e:
        print(f"[SIM] Publish error: {e}, retrying...")
    time.sleep(3)
