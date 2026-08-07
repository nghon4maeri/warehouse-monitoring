"""
Smart Warehouse — AI Module v4
===============================
- POST /predict — classify + statistical anomaly detection (Welford + z-score)
- GET  /stats   — learned statistics (mean, std, count)
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Warehouse AI Module", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-module")

# ═══════════════════════
#  Thresholds
# ═══════════════════════
LIGHT_MAX  = 250
MEDIUM_MAX = 750
HEAVY_MAX  = 1200

ZSCORE_THRESHOLD = 2.5
MIN_SAMPLES      = 20

# ═══════════════════════
#  Welford's online stats
# ═══════════════════════
class OnlineStats:
    def __init__(self):
        self.n    = 0
        self.mean = 0.0
        self.m2   = 0.0

    def update(self, x: float):
        self.n += 1
        delta  = x - self.mean
        self.mean += delta / self.n
        self.m2   += delta * (x - self.mean)

    @property
    def std(self) -> float:
        return (self.m2 / self.n) ** 0.5 if self.n > 1 else 0.0

    def to_dict(self):
        return {"count": self.n, "mean": round(self.mean, 2), "std": round(self.std, 2)}

stats_weight   = OnlineStats()
stats_dwell    = OnlineStats()
stats_distance = OnlineStats()

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

class StatsResponse(BaseModel):
    weight: dict
    dwell: dict
    distance: dict

# ═══════════════════════
#  Logic
# ═══════════════════════

def classify_cargo(w: float) -> str:
    if w <= 0:        return "None"
    if w < LIGHT_MAX:  return "Light"
    if w < MEDIUM_MAX: return "Medium"
    return "Heavy"

def detect_anomalies(w: float, d: float, t: float) -> list[str]:
    reasons = []

    if d < 0:
        reasons.append(f"SENSOR FAULT — no echo")
    if w < 0:
        reasons.append(f"SENSOR FAULT — negative weight ({w:.0f}g)")
    if w > HEAVY_MAX:
        reasons.append(f"OVERLOAD — {w:.0f}g > {HEAVY_MAX}g capacity")

    if stats_weight.n < MIN_SAMPLES or w <= 0 or d < 0:
        return reasons

    if stats_weight.std > 0:
        z = (w - stats_weight.mean) / stats_weight.std
        if abs(z) > ZSCORE_THRESHOLD:
            reasons.append(f"Weight anomaly: {w:.0f}g (z={z:+.1f}σ, normal ~{stats_weight.mean:.0f}±{stats_weight.std:.0f}g)")

    if stats_dwell.std > 0 and t > 0:
        z = (t - stats_dwell.mean) / stats_dwell.std
        if abs(z) > ZSCORE_THRESHOLD:
            reasons.append(f"Dwell anomaly: {t:.1f}s (z={z:+.1f}σ, normal ~{stats_dwell.mean:.1f}±{stats_dwell.std:.1f}s)")

    if stats_distance.std > 0 and d > 0:
        z = (d - stats_distance.mean) / stats_distance.std
        if abs(z) > ZSCORE_THRESHOLD:
            reasons.append(f"Distance anomaly: {d:.1f}cm (z={z:+.1f}σ)")

    return reasons

# ═══════════════════════
#  Endpoints
# ═══════════════════════
@app.get("/")
def root():
    return {"service": "warehouse-ai", "status": "ok", "version": "4.0.0"}

@app.post("/predict", response_model=PredictResponse)
def predict(payload: SensorPayload):
    w, d, t = payload.weight_g, payload.distance_cm, payload.dwell_time_sec

    category = classify_cargo(w)
    anomalies = detect_anomalies(w, d, t)

    if w > 0 and d >= 0:
        stats_weight.update(w)
        if t > 0:
            stats_dwell.update(t)
        stats_distance.update(d)

    if anomalies:
        return PredictResponse(
            category=category, is_anomaly=True,
            anomaly_reason="; ".join(anomalies),
            recommended_action="INSPECT_STATION",
        )
    return PredictResponse(
        category=category, is_anomaly=False,
        anomaly_reason="", recommended_action=f"SORT_{category.upper()}",
    )

@app.get("/stats", response_model=StatsResponse)
def get_stats():
    return StatsResponse(
        weight=stats_weight.to_dict(),
        dwell=stats_dwell.to_dict(),
        distance=stats_distance.to_dict(),
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
