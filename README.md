# Smart Warehouse Monitoring System

**IoT + AI warehouse simulation — ESP32 sensors → MQTT → Node.js → React dashboard, with statistical anomaly detection and Firebase persistence.**

![Data Flow](docs/data_flow.png)

## Tech Stack

| Layer | Technology |
|---|---|
| Firmware | ESP32 (Wokwi), C++/Arduino, MQTT |
| Backend | Node.js, Express, Socket.io, MQTT.js |
| Frontend | React 18, Vite, TailwindCSS, Recharts |
| Database | PostgreSQL 15 (auth), Firebase RTDB (sensors) |
| AI | Python, FastAPI, Welford's online statistics |
| Auth | JWT + bcrypt |
| DevOps | Docker Compose (optional) |

## Quick Start (Local)

```bash
# 1. PostgreSQL (via Docker, or local install)
docker compose up -d db

# 2. Backend
cd backend && npm install && node server.js

# 3. Frontend
cd frontend && npm install && npm run dev

# 4. AI Module
cd ai-module && pip install -r requirements.txt && python main.py

# 5. Simulator (optional — for testing without Wokwi)
pip install paho-mqtt && python tools/mqtt_sim.py
```

Open `http://localhost:5173` → register/login → dashboard.

## Quick Start (Docker)

```bash
docker compose up --build
# Frontend: http://localhost
# Backend:  http://localhost:4000
# AI must be run separately: cd ai-module && python main.py
```

## Wokwi Simulation

The `firmware/` folder contains the ESP32 simulation:

```
firmware/
├── sketch.ino      # All code in one file
├── diagram.json    # 5 components: ESP32, HC-SR04, HX711, Servo, Buzzer
├── libraries.txt   # PubSubClient, HX711
└── wokwi.toml      # VS Code Wokwi config
```

**Option A — Wokwi Web:**
1. Go to https://wokwi.com → New Project → ESP32
2. Paste `diagram.json` → `sketch.ino`
3. Add libraries: `PubSubClient`, `HX711`
4. Press Play ▶

**Option B — VS Code:**
1. Install "Wokwi for VS Code" extension
2. Open `firmware/` folder
3. `F1 → Wokwi: Start IoT Gateway`
4. `F1 → Wokwi: Start Simulation`

## MQTT Topics

| Topic | Direction | Example |
|---|---|---|
| `warehouse/sensors` | ESP32 → Backend | `{"deviceId":"STATION_01","distance_cm":42.3,"weight_g":350.0,"dwell_time_sec":2.5}` |
| `warehouse/actuators` | Backend → ESP32 | `{"command":"gate_light"}` |

## Sensor Data Format

| Field | Unit | Source |
|---|---|---|
| `deviceId` | — | Station ID |
| `distance_cm` | cm | HC-SR04 ultrasonic |
| `weight_g` | gram | HX711 loadcell |
| `dwell_time_sec` | seconds | Time object < 15cm from sensor |

## Firebase

Sensor readings are stored in Firebase Realtime Database at `sensors/STATION_01/<timestamp>`.

To enable: place `serviceAccountKey.json` in `backend/config/` and set `FIREBASE_DATABASE_URL` in `.env`. Falls back gracefully if not configured.

## Environment (.env)

```env
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=warehouse_db
PG_USER=warehouse_admin
PG_PASSWORD=change_me_in_production

FIREBASE_SERVICE_ACCOUNT_PATH=./config/serviceAccountKey.json
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

MQTT_BROKER_URL=mqtt://broker.hivemq.com

JWT_SECRET=your_random_secret_here

PORT=4000
CORS_ORIGIN=http://localhost:5173
AI_SERVICE_URL=http://localhost:8000
```

## Endpoints

| URL | Description |
|---|---|
| `http://localhost:5173` | Frontend dashboard |
| `http://localhost:4000/api/health` | Backend health |
| `http://localhost:4000/api/auth/login` | Login |
| `http://localhost:4000/api/auth/register` | Register |
| `http://localhost:8000/` | AI health |
| `http://localhost:8000/predict` | AI classify + anomaly |
| `http://localhost:8000/stats` | AI learned statistics |

## Default Credentials

```
Email:    admin@warehouse.local
Password: admin123
```

## Screenshots

> Add screenshots to `docs/` folder after running the project:

| # | Screenshot | File | Description |
|---|---|---|---|
| 1 | **Dashboard** | `docs/dashboard.png` | Gauges, charts, history table |
| 2 | **Anomaly** | `docs/anomaly.png` | Red anomaly banner with z-score |
| 3 | **Wokwi Circuit** | `docs/wokwi.png` | ESP32 + HC-SR04 + HX711 + Servo + Buzzer |
| 4 | **Firebase** | `docs/firebase.png` | RTDB sensors/STATION_01/ entries |
| 5 | **Data Flow** | `docs/data_flow.png` | System architecture (render from `docs/DATA_FLOW.md`) |
