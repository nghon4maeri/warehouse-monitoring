"""
Smart Warehouse — AI Module v4 (Optimized Version)
===============================
- POST /predict     — classify + statistical anomaly detection (Welford + z-score)
- GET  /stats       — learned statistics (mean, std, count)
- POST /reset-stats — reset learned baseline (for testing)
"""

import logging
import json
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-module")

CACHE_FILE = "stats_cache.json"

# ═══════════════════════
#  Thresholds
# ═══════════════════════
LIGHT_MAX  = 250
MEDIUM_MAX = 750
HEAVY_MAX  = 1200

ZSCORE_THRESHOLD = 2.5
MIN_SAMPLES      = 20

# ═══════════════════════
#  Welford's online stats with Persistence
# ═══════════════════════
class OnlineStats:
    def __init__(self, name: str):
        self.name = name
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

    # [OPTIMIZED] Khôi phục trạng thái từ dictionary cache
    def load_dict(self, data: dict):
        self.n = data.get("count", 0)
        self.mean = data.get("mean", 0.0)
        std = data.get("std", 0.0)
        self.m2 = (std ** 2) * self.n if self.n > 1 else 0.0

    def reset(self):
        self.n = 0
        self.mean = 0.0
        self.m2 = 0.0

stats_weight   = OnlineStats("weight")
stats_dwell    = OnlineStats("dwell")
stats_distance = OnlineStats("distance")

# [OPTIMIZED] Tự động Lưu/Đọc cache ra file json
def save_cache():
    try:
        data = {
            "weight": stats_weight.to_dict(),
            "dwell": stats_dwell.to_dict(),
            "distance": stats_distance.to_dict(),
        }
        with open(CACHE_FILE, "w") as f:
            json.dump(data, f, indent=2)
        logger.info("[Cache] Statistics saved to stats_cache.json")
    except Exception as e:
        logger.error(f"[Cache] Failed to save stats: {e}")

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                data = json.load(f)
                stats_weight.load_dict(data.get("weight", {}))
                stats_dwell.load_dict(data.get("dwell", {}))
                stats_distance.load_dict(data.get("distance", {}))
            logger.info("[Cache] Statistics loaded successfully")
        except Exception as e:
            logger.error(f"[Cache] Failed to load stats: {e}")

# [OPTIMIZED] Quản lý vòng đời ứng dụng FastAPI (Lifespan Context)
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_cache()
    yield
    save_cache()

app = FastAPI(title="Warehouse AI Module", version="4.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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
    return {"service": "warehouse-ai", "status": "ok", "version": "4.1.0"}

@app.post("/predict", response_model=PredictResponse)
def predict(payload: SensorPayload):
    w, d, t = payload.weight_g, payload.distance_cm, payload.dwell_time_sec

    category = classify_cargo(w)
    anomalies = detect_anomalies(w, d, t)

    # [OPTIMIZED] Chỉ cập nhật Welford khi dữ liệu không bị lỗi thô (đảm bảo độ chính xác cho AI)
    if w > 0 and d >= 0 and not anomalies:
        stats_weight.update(w)
        if t > 0:
            stats_dwell.update(t)
        stats_distance.update(d)
        save_cache()

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

# [OPTIMIZED] Endpoint reset baseline khi cần demo thử nghiệm lại từ đầu
@app.post("/reset-stats")
def reset_stats():
    stats_weight.reset()
    stats_dwell.reset()
    stats_distance.reset()
    save_cache()
    return {"message": "AI statistics reset successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)