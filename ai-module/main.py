"""
Smart Warehouse — AI Prediction Module
=========================================
FastAPI micro-service providing:
  - /predict/peak-hour         – forecast peak warehouse activity
  - /predict/maintenance-alert – anomaly detection via Isolation Forest
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ──────────────────────────────────────────────
#  App Initialisation
# ──────────────────────────────────────────────
app = FastAPI(
    title="Warehouse AI Module",
    version="1.0.0",
    description="Predictive analytics for IoT warehouse monitoring",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-module")

# ──────────────────────────────────────────────
#  Models (lazy-loaded in production — pre-fit
#  with historical data stored elsewhere)
# ──────────────────────────────────────────────

# --- Dummy historical data for demo purposes ---
# In production you'd load this from PostgreSQL / BigQuery.
def _generate_demo_data(num_samples: int = 200):
    """Generate synthetic warehouse sensor readings for demo."""
    rng = np.random.default_rng(seed=42)
    hours = np.arange(num_samples) % 24  # hour of day
    # Activity peaks around 10:00 and 15:00
    base = 20 + 15 * np.sin(np.pi * (hours - 6) / 12) + 25 * np.sin(np.pi * (hours - 14) / 8)
    activity = base + rng.normal(0, 3, num_samples)
    return hours.reshape(-1, 1), activity


X_demo, y_demo = _generate_demo_data()

# --- Linear Regression: predict activity level for a given hour ---
_scaler = StandardScaler()
X_scaled = _scaler.fit_transform(X_demo)
_peak_model = LinearRegression().fit(X_scaled, y_demo)

# --- Isolation Forest: flag anomalous sensor readings ---
_anomaly_model = IsolationForest(
    n_estimators=100,
    contamination=0.05,
    random_state=42,
).fit(np.column_stack([X_demo.ravel(), y_demo]))


# ──────────────────────────────────────────────
#  Pydantic Schemas
# ──────────────────────────────────────────────
class PeakHourResponse(BaseModel):
    hour: int
    predicted_activity: float
    unit: str = "units"
    confidence: str = "demo model — replace with production pipeline"


class AnomalyResponse(BaseModel):
    is_anomaly: bool
    anomaly_score: float
    recommendation: str


class SensorReading(BaseModel):
    distance_cm: float
    color: str = "unknown"
    temperature: Optional[float] = None
    humidity: Optional[float] = None


# ──────────────────────────────────────────────
#  Endpoints
# ──────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "warehouse-ai", "status": "ok"}


@app.get("/predict/peak-hour", response_model=PeakHourResponse)
def predict_peak_hour(hour: int = Query(..., ge=0, le=23, description="Hour of day (0-23)")):
    """
    Predict expected warehouse activity level for a given hour.
    Uses a trained linear-regression model (demo).
    """
    try:
        scaled = _scaler.transform([[hour]])
        prediction = _peak_model.predict(scaled)[0]
        logger.info(f"Peak-hour prediction for hour={hour}: {prediction:.2f}")
        return PeakHourResponse(
            hour=hour,
            predicted_activity=round(float(prediction), 2),
        )
    except Exception as exc:
        logger.exception("Peak-hour prediction failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/predict/maintenance-alert", response_model=AnomalyResponse)
def maintenance_alert(readings: List[SensorReading]):
    """
    Run anomaly detection on a batch of sensor readings.
    Returns whether each reading is anomalous and a recommendation.
    """
    if not readings:
        raise HTTPException(status_code=400, detail="At least one reading required")

    try:
        results = []
        for r in readings:
            hour = datetime.utcnow().hour
            features = np.array([[hour, r.distance_cm]])
            # Isolation Forest: -1 = anomaly, 1 = normal
            label = _anomaly_model.predict(features)[0]
            score = _anomaly_model.decision_function(features)[0]

            results.append(AnomalyResponse(
                is_anomaly=bool(label == -1),
                anomaly_score=round(float(score), 4),
                recommendation=(
                    "High anomaly detected — inspect sensor / conveyor belt"
                    if label == -1
                    else "Normal operation — no action required"
                ),
            ))

        return {"readings": [r.model_dump() for r in results], "count": len(results)}
    except Exception as exc:
        logger.exception("Anomaly detection failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ──────────────────────────────────────────────
#  Entry Point
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
