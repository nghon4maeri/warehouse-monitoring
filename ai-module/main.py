"""
Smart Warehouse — AI Prediction Module v2
==========================================
FastAPI micro-service providing:
  - POST /predict  — classify cargo & detect anomalies

Uses:
  - DecisionTreeClassifier (Light / Medium / Heavy)
  - IsolationForest + rule-based checks (jams, overload, bad readings)
"""

import os
import logging
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ──────────────────────────────────────────────
#  App Initialisation
# ──────────────────────────────────────────────
app = FastAPI(
    title="Warehouse AI Module v2",
    version="2.0.0",
    description="ML cargo classification & anomaly detection for IoT warehouse",
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
#  Pydantic Schemas
# ──────────────────────────────────────────────
class SensorPayload(BaseModel):
    weight_g: float
    distance_cm: float
    dwell_time_sec: float


class PredictResponse(BaseModel):
    category: str
    is_anomaly: bool
    anomaly_reason: str
    recommended_action: str


# ──────────────────────────────────────────────
#  Training Data for DecisionTreeClassifier
# ──────────────────────────────────────────────
# Features: [weight_g, dwell_time_sec]
# Labels:   0=Light, 1=Medium, 2=Heavy

def _build_training_data():
    X, y = [], []

    # Light:   0–250g
    for _ in range(40):
        w = np.random.uniform(0, 249)
        d = np.random.uniform(0.5, 3.0)
        X.append([w, d])
        y.append(0)

    # Medium:  250–750g
    for _ in range(40):
        w = np.random.uniform(250, 749)
        d = np.random.uniform(1.0, 5.0)
        X.append([w, d])
        y.append(1)

    # Heavy:   750–1200g
    for _ in range(40):
        w = np.random.uniform(750, 1200)
        d = np.random.uniform(2.0, 7.0)
        X.append([w, d])
        y.append(2)

    return np.array(X), np.array(y)


X_train, y_train = _build_training_data()

# ── Decision Tree Classifier ──
_clf = DecisionTreeClassifier(max_depth=4, random_state=42)
_clf.fit(X_train, y_train)

# ── Isolation Forest for anomaly detection ──
_anomaly_model = IsolationForest(
    n_estimators=100,
    contamination=0.05,
    random_state=42,
).fit(X_train)

# ── Scaler for isolation forest input ──
_scaler = StandardScaler().fit(X_train)

CATEGORY_MAP = {0: "Light", 1: "Medium", 2: "Heavy"}


# ──────────────────────────────────────────────
#  Endpoints
# ──────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "warehouse-ai", "status": "ok", "version": "2.0.0"}


@app.post("/predict", response_model=PredictResponse)
def predict(payload: SensorPayload):
    """
    Classify cargo and detect anomalies.

    Input:
      - weight_g: measured weight of the cargo
      - distance_cm: ultrasonic distance reading
      - dwell_time_sec: time the object has been in the station zone

    Returns:
      - category: "Light", "Medium", or "Heavy"
      - is_anomaly: whether an anomaly is detected
      - anomaly_reason: explanation if anomaly detected
      - recommended_action: TRIGGER_ALARM or SORT_<CATEGORY>
    """
    w = payload.weight_g
    d = payload.distance_cm
    t = payload.dwell_time_sec

    logger.info(f"Predict request — weight={w:.1f}g, dist={d:.1f}cm, dwell={t:.1f}s")

    # ── Step 1: Rule-based anomaly checks ──
    anomaly_reasons = []

    # Jam detection: object stayed > 7 seconds
    if t > 7.0:
        anomaly_reasons.append(f"JAM DETECTED: object stalled for {t:.1f}s")

    # Overload detection: weight exceeds 1200g
    if w > 1200.0:
        anomaly_reasons.append(f"OVERLOAD: weight {w:.1f}g exceeds 1200g limit")

    # Sensor fault: impossible distance or negative weight
    if d < 0 or w < 0:
        anomaly_reasons.append(f"SENSOR FAULT: distance={d:.1f}cm, weight={w:.1f}g")

    # ── Step 2: ML anomaly detection (Isolation Forest) ──
    try:
        features = np.array([[w, t]])
        scaled = _scaler.transform(features)
        ml_label = _anomaly_model.predict(scaled)[0]
        if ml_label == -1:
            anomaly_reasons.append("ML anomaly detected — unusual weight/dwell pattern")
    except Exception as exc:
        logger.error(f"IsolationForest error: {exc}")

    # ── Step 3: Determine category ──
    try:
        cat_idx = _clf.predict(np.array([[w, t]]))[0]
        category = CATEGORY_MAP.get(int(cat_idx), "Unknown")
    except Exception:
        # Fallback: rule-based classification
        if w < 250:
            category = "Light"
        elif w < 750:
            category = "Medium"
        else:
            category = "Heavy"

    # ── Step 4: Build response ──
    is_anomaly = len(anomaly_reasons) > 0

    if is_anomaly:
        anomaly_reason = "; ".join(anomaly_reasons)
        recommended_action = "TRIGGER_ALARM"
    else:
        anomaly_reason = ""
        recommended_action = f"SORT_{category.upper()}"

    logger.info(
        f"Prediction → category={category}, anomaly={is_anomaly}, "
        f"action={recommended_action}"
    )

    return PredictResponse(
        category=category,
        is_anomaly=is_anomaly,
        anomaly_reason=anomaly_reason,
        recommended_action=recommended_action,
    )


# ──────────────────────────────────────────────
#  Entry Point
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
