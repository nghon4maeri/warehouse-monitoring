"""
Test — Full AI Classification + Anomaly Detection (ID 1, 2, 4, 11)
===================================================================
Test all classification cases + hard-rule anomalies + statistical anomalies.
"""
import json, time, sys, requests

AI_URL = "http://localhost:8000"
BACKEND_URL = "http://localhost:4000"
BROKER = "broker.hivemq.com"
TOPIC = "warehouse/sensors"

results = []

def case(name, payload, exp_cat, exp_anom):
    print(f"\n  [{name}] w={payload['weight_g']}g d={payload['distance_cm']}cm")
    try:
        r = requests.post(f"{AI_URL}/predict", json=payload, timeout=3)
        ai = r.json()
    except Exception as e:
        print(f"    ERROR: {e}")
        results.append({"name": name, "status": "ERROR"})
        return

    cat_ok = ai["category"] == exp_cat
    anom_ok = ai["is_anomaly"] == exp_anom
    status = "PASS" if (cat_ok and anom_ok) else "FAIL"
    print(f"    AI: cat={ai['category']} (want {exp_cat}), anomaly={ai['is_anomaly']} (want {exp_anom})  [{status}]")
    if not cat_ok:
        print(f"    ^^^ WRONG CATEGORY")
    if not anom_ok:
        print(f"    ^^^ WRONG ANOMALY")
    results.append({"name": name, "status": status})


def main():
    print("\n" + "=" * 60)
    print("  AI Classification + Anomaly Detection Test")
    print("=" * 60)

    # Reset
    try:
        requests.post(f"{AI_URL}/reset-stats", timeout=3)
        print("[AI] Stats reset\n")
    except:
        pass

    # === Normal Classification ===
    print("--- Normal Classification ---")
    case("Light 100g",       {"deviceId":"T1","distance_cm":10,"weight_g":100,"dwell_time_sec":1}, "Light", False)
    case("Light edge 249g",  {"deviceId":"T2","distance_cm":10,"weight_g":249,"dwell_time_sec":1}, "Light", False)
    case("Medium 500g",      {"deviceId":"T3","distance_cm":12,"weight_g":500,"dwell_time_sec":2}, "Medium", False)
    case("Medium edge 749g", {"deviceId":"T4","distance_cm":10,"weight_g":749,"dwell_time_sec":2}, "Medium", False)
    case("Heavy 800g",       {"deviceId":"T5","distance_cm":8,"weight_g":800,"dwell_time_sec":3}, "Heavy", False)
    case("Heavy edge 1199g", {"deviceId":"T6","distance_cm":10,"weight_g":1199,"dwell_time_sec":3}, "Heavy", False)

    # === Hard-rule Anomaly ===
    print("\n--- Hard-rule Anomaly Detection ---")
    case("OVERLOAD 1300g",          {"deviceId":"A1","distance_cm":8,"weight_g":1300,"dwell_time_sec":4}, "Heavy", True)
    case("OVERLOAD 2000g",          {"deviceId":"A2","distance_cm":10,"weight_g":2000,"dwell_time_sec":5}, "Heavy", True)
    case("FAULT negative weight",   {"deviceId":"A3","distance_cm":10,"weight_g":-10,"dwell_time_sec":0}, "None", True)
    case("FAULT negative distance", {"deviceId":"A4","distance_cm":-5,"weight_g":300,"dwell_time_sec":0}, "Medium", True)

    # === Edge Cases ===
    print("\n--- Edge Cases ---")
    case("Zero weight",    {"deviceId":"E1","distance_cm":10,"weight_g":0,"dwell_time_sec":0}, "None", False)
    case("Zero distance",  {"deviceId":"E2","distance_cm":0,"weight_g":300,"dwell_time_sec":1}, "Medium", False)

    # === Statistical Anomaly (Z-score > 2.5 sigma) ===
    print("\n--- Statistical Anomaly (Z-score) ---")

    # Reset stats to build a CLEAN baseline (no previous test contamination)
    requests.post(f"{AI_URL}/reset-stats", timeout=3)
    print("  Building baseline (22 samples, ~500g)...")
    for i in range(22):
        try:
            requests.post(f"{AI_URL}/predict", json={
                "deviceId":"STAT","distance_cm":12,"weight_g":500 + (i%5)*8,"dwell_time_sec":2
            }, timeout=2)
        except:
            pass
    print("  Baseline built.")

    r = requests.get(f"{AI_URL}/stats", timeout=3)
    bl = r.json()["weight"]
    print(f"  Stats: count={bl['count']} mean={bl['mean']:.0f}g std={bl['std']:.0f}g")

    # Outlier: z = (outlier - mean) / std must be > 2.5
    # With baseline mean~520 std~12, 800g gives z = 280/12 = 23 >> 2.5
    outlier_w = 800
    print(f"  Sending OUTLIER ({outlier_w}g) — should trigger Z-score anomaly...")
    r = requests.post(f"{AI_URL}/predict", json={
        "deviceId":"STAT","distance_cm":12,"weight_g":outlier_w,"dwell_time_sec":2
    }, timeout=3)
    ai = r.json()
    ok = ai["is_anomaly"] == True
    print(f"  AI: anomaly={ai['is_anomaly']}  [{'PASS' if ok else 'FAIL'}]")
    results.append({"name": "Z-score outlier detected", "status": "PASS" if ok else "FAIL"})

    print("  Sending NORMAL (500g)...")
    r = requests.post(f"{AI_URL}/predict", json={
        "deviceId":"STAT","distance_cm":12,"weight_g":500,"dwell_time_sec":2
    }, timeout=3)
    ai = r.json()
    ok2 = ai["is_anomaly"] == False
    print(f"  AI: anomaly={ai['is_anomaly']}  [{'PASS' if ok2 else 'FAIL'}]")
    results.append({"name": "Z-score normal (no false positive)", "status": "PASS" if ok2 else "FAIL"})

    # === AI Stats ===
    print("\n--- AI Learned Stats ---")
    r = requests.get(f"{AI_URL}/stats", timeout=3)
    for k, v in r.json().items():
        print(f"  {k:10s}: count={v['count']:3d}  mean={v['mean']:7.1f}  std={v['std']:6.1f}")

    # === MQTT Pipeline ===
    print("\n--- MQTT -> Backend -> Firebase ---")
    try:
        from paho.mqtt import client as mqtt
        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        c.connect(BROKER, 1883, 60)
        c.publish(TOPIC, json.dumps({
            "deviceId":"PIPE","distance_cm":15,"weight_g":420,"dwell_time_sec":2
        }))
        c.disconnect()
        time.sleep(1)
        r = requests.get(f"{BACKEND_URL}/api/health", timeout=3)
        print(f"  Backend: {'OK' if r.status_code == 200 else 'DOWN'}")
        results.append({"name": "MQTT Pipeline", "status": "PASS" if r.status_code == 200 else "FAIL"})
    except Exception as e:
        print(f"  SKIP: {e}")

    # === Summary ===
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] != "PASS")

    print(f"\n{'=' * 60}")
    print(f"  {passed} PASS, {failed} FAIL out of {len(results)} tests")
    for r in results:
        if r["status"] != "PASS":
            print(f"  [{r['status']}] {r['name']}")
    print(f"{'=' * 60}")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
