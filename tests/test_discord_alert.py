"""
Test 3 — Discord Webhook Alert (ID 6)
Gửi dữ liệu anomaly qua MQTT → Backend → Discord Webhook
"""
import json, time, sys, os
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
load_dotenv()

BROKER = "broker.hivemq.com"
TOPIC = "warehouse/sensors"
WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")

def test_discord_alert():
    print("\n=== TEST 3: Discord Webhook Alert ===\n")

    if not WEBHOOK_URL or "xxx" in WEBHOOK_URL:
        print("SKIP — DISCORD_WEBHOOK_URL not configured. Add to .env:")
        print("  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy")
        return None

    client = mqtt.Client()
    client.connect(BROKER, 1883, 60)

    # Gửi anomaly: weight > 1200g = OVERLOAD
    payload = {
        "deviceId": "TEST_DISCORD",
        "distance_cm": 8,
        "weight_g": 1450,
        "dwell_time_sec": 4,
    }
    print(f"[MQTT] Sending OVERLOAD anomaly: {payload['weight_g']}g")
    client.publish(TOPIC, json.dumps(payload))
    time.sleep(2)

    # Gửi anomaly: distance < 0 = SENSOR FAULT
    payload2 = {
        "deviceId": "TEST_DISCORD",
        "distance_cm": -1,
        "weight_g": 200,
        "dwell_time_sec": 0,
    }
    print(f"[MQTT] Sending SENSOR FAULT: distance={payload2['distance_cm']}cm")
    client.publish(TOPIC, json.dumps(payload2))
    time.sleep(2)

    client.disconnect()

    print("\nCheck Discord channel for 2 red embed alerts:")
    print("  1. OVERLOAD — 1450g > 1200g capacity")
    print("  2. SENSOR FAULT — negative distance")
    print("\nPASS — Anomaly data sent. Verify alerts arrived in Discord.")
    return True

if __name__ == "__main__":
    test_discord_alert()
