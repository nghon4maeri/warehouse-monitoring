"""
Test 2 — AI Module (ID 11)
Kiểm tra endpoint /predict và /stats của AI microservice
"""
import requests, json, sys

AI_URL = "http://localhost:8000"

def test_ai_predict():
    print("\n=== TEST 2: AI Module ===\n")

    # Health check
    try:
        r = requests.get(f"{AI_URL}/", timeout=3)
        print(f"[GET /] {r.json()}")
    except:
        print("FAIL — AI module not running (cd ai-module && python main.py)")
        return False

    # Normal prediction
    normal = {"weight_g": 300, "distance_cm": 12, "dwell_time_sec": 2}
    r = requests.post(f"{AI_URL}/predict", json=normal)
    result = r.json()
    print(f"[POST /predict] Normal: category={result['category']}, anomaly={result['is_anomaly']}")

    # Overload anomaly
    overload = {"weight_g": 1300, "distance_cm": 10, "dwell_time_sec": 3}
    r = requests.post(f"{AI_URL}/predict", json=overload)
    result = r.json()
    print(f"[POST /predict] Overload: anomaly={result['is_anomaly']}, reason={result['anomaly_reason']}, action={result['recommended_action']}")
    assert result["is_anomaly"] == True, "Expected anomaly for overload"
    assert result["recommended_action"] == "INSPECT_STATION"

    # Sensor fault
    fault = {"weight_g": -5, "distance_cm": 15, "dwell_time_sec": 1}
    r = requests.post(f"{AI_URL}/predict", json=fault)
    result = r.json()
    print(f"[POST /predict] Fault: anomaly={result['is_anomaly']}, reason={result['anomaly_reason']}")
    assert result["is_anomaly"] == True

    # Get stats
    r = requests.get(f"{AI_URL}/stats")
    stats = r.json()
    print(f"[GET /stats] {json.dumps(stats, indent=2)}")

    print("\nPASS — AI module works correctly")
    return True

if __name__ == "__main__":
    sys.exit(0 if test_ai_predict() else 1)
