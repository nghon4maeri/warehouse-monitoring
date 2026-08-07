"""
Smart Warehouse — AI Module v3
===============================
- POST /predict   — classify cargo + detect anomalies (rule-based)
- GET  /forecast  — predict pkgs/min next 10 min (Linear Regression)
- POST /log       — chỉ log data cho forecast, ko cần classify
"""

import time
from collections import defaultdict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

app = FastAPI(title="Warehouse AI Module", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-module")

# ═══════════════════════
#  Thresholds
# ═══════════════════════
LIGHT_MAX   = 250
MEDIUM_MAX  = 750
HEAVY_MAX   = 1200
JAM_DWELL_S = 7.0
OBJECT_NEAR = 15.0

# ═══════════════════════
#  Data storage for forecast
# ═══════════════════════
minute_counts: dict[int, int] = defaultdict(int)   # minute_timestamp → count

def _cleanup_storage():
    """Giữ tối đa 90 phút dữ liệu gần nhất"""
    if len(minute_counts) <= 90:
        return
    cutoff = int(time.time()) // 60 - 90
    for k in list(minute_counts.keys()):
        if k < cutoff:
            del minute_counts[k]

def _log_reading():
    now = int(time.time())
    minute_key = now // 60
    minute_counts[minute_key] += 1
    _cleanup_storage()

# ═══════════════════════
#  ML: Simple Linear Regression
#     y = slope * x + intercept
#  (least squares, pure Python)
# ═══════════════════════
def linear_regression(x: list[float], y: list[float]):
    n = len(x)
    if n < 2:
        return 0.0, sum(y) / n if n else 0.0
    mx = sum(x) / n
    my = sum(y) / n
    num = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    den = sum((x[i] - mx) ** 2 for i in range(n))
    slope = num / den if den != 0 else 0.0
    intercept = my - slope * mx
    return slope, intercept

# ═══════════════════════
#  Schemas
# ═══════════════════════
class SensorPayload(BaseModel):
    weight_g: float
    distance_cm: float
    dwell_time_sec: float

class PredictResponse(BaseModel):
    category: str
    is_anomaly: bool
    anomaly_reason: str
    recommended_action: str

class ForecastPoint(BaseModel):
    minute: int
    predicted_packages: float

class ForecastResponse(BaseModel):
    current_rate: float
    trend: str
    predictions: list[ForecastPoint]
    data_points: int

# ═══════════════════════
#  Classification
# ═══════════════════════
def classify_cargo(weight_g: float) -> str:
    if weight_g <= 0:
        return "None"
    elif weight_g < LIGHT_MAX:
        return "Light"
    elif weight_g < MEDIUM_MAX:
        return "Medium"
    elif weight_g <= HEAVY_MAX:
        return "Heavy"
    else:
        return "Heavy"

def detect_anomalies(weight_g: float, distance_cm: float, dwell_s: float) -> list[str]:
    reasons = []
    if distance_cm < 0:
        reasons.append(f"SENSOR FAULT — no echo")
    if weight_g < 0:
        reasons.append(f"SENSOR FAULT — negative weight")
    if distance_cm >= OBJECT_NEAR and dwell_s <= 0:
        pass
    elif dwell_s > JAM_DWELL_S:
        reasons.append(f"JAM — stalled {dwell_s:.1f}s")
    if weight_g > HEAVY_MAX:
        reasons.append(f"OVERLOAD — {weight_g:.0f}g > {HEAVY_MAX}g")
    return reasons

# ═══════════════════════
#  Endpoints
# ═══════════════════════
@app.get("/")
def root():
    return {"service": "warehouse-ai", "status": "ok", "version": "3.0.0"}

@app.post("/predict", response_model=PredictResponse)
def predict(payload: SensorPayload):
    w, d, t = payload.weight_g, payload.distance_cm, payload.dwell_time_sec
    _log_reading()

    category = classify_cargo(w)
    anomalies = detect_anomalies(w, d, t)

    if anomalies:
        return PredictResponse(
            category=category, is_anomaly=True,
            anomaly_reason="; ".join(anomalies),
            recommended_action="TRIGGER_ALARM",
        )
    return PredictResponse(
        category=category, is_anomaly=False,
        anomaly_reason="", recommended_action=f"SORT_{category.upper()}",
    )

@app.post("/log")
def log_reading(payload: SensorPayload):
    """Chỉ log data cho forecast (gọi từ backend mỗi khi có sensor data)"""
    _log_reading()
    return {"ok": True, "minute_key": int(time.time()) // 60}

@app.get("/forecast", response_model=ForecastResponse)
def forecast():
    """Dự đoán số packages/phút trong 10 phút tiếp theo"""
    sorted_mins = sorted(minute_counts.items())[-30:]
    if len(sorted_mins) < 3:
        return ForecastResponse(current_rate=0, trend="insufficient_data", predictions=[], data_points=len(sorted_mins))

    x = list(range(len(sorted_mins)))
    y = [count for _, count in sorted_mins]
    slope, intercept = linear_regression(x, y)

    recent_5 = [c for _, c in sorted_mins[-5:]]
    current_rate = sum(recent_5) / len(recent_5) if recent_5 else 0

    trend = "up" if slope > 0.15 else "down" if slope < -0.15 else "stable"

    predictions = []
    for i in range(1, 11):
        pred = slope * (len(x) + i - 1) + intercept
        predictions.append(ForecastPoint(minute=i, predicted_packages=max(0, round(pred, 1))))

    logger.info(f"Forecast: rate={current_rate:.1f}/min, trend={trend}, slope={slope:.3f}")
    return ForecastResponse(
        current_rate=round(current_rate, 1),
        trend=trend,
        predictions=predictions,
        data_points=len(sorted_mins),
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
