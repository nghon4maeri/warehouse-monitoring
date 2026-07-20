# IoT &amp; AI-Integrated Smart Warehouse Monitoring and Sorting System

**Monorepo** | `warehouse-monitoring`

A full-stack, real-time warehouse automation simulation platform combining embedded IoT hardware (ESP32 via Wokwi), a Node.js/Express backend, a React dashboard, and a Python AI micro-service. Designed for academic demonstration of Industry 4.0 concepts — sensor telemetry, actuator control, time-series storage, predictive analytics, and secure authentication.

---

## Table of Contents

1. [Project Overview &amp; Features](#project-overview--features)
2. [Hardware Pin Mapping (Wokwi)](#hardware-pin-mapping-wokwi)
3. [Technology Stack](#technology-stack)
4. [Directory Tree](#directory-tree)
5. [Environment Variables Configuration](#environment-variables-configuration)
6. [Data Flow &amp; Architecture](#data-flow--architecture)
7. [Getting Started](#getting-started)
8. [API Reference](#api-reference)
9. [MQTT Topic Specification](#mqtt-topic-specification)

---

## Project Overview &amp; Features

### Hardware / Firmware Layer (ESP32 + Wokwi)

| Feature | Description |
|---|---|
| **Ultrasonic Ranging** | HC-SR04 sensor reads obstacle distance (cm) every 2 seconds and streams values via MQTT. |
| **Colour Sorting Simulation** | Firmware randomly assigns a colour label (`RED`, `BLUE`, `GREEN`, `NONE`) to each reading, enabling visual demonstration of conveyor-belt colour detection in the dashboard. |
| **Servo Gate &amp; Buzzer** | SG90 servo acts as a warehouse gate (open/close). An active buzzer provides audible emergency alerts. Both are remotely controllable from the web UI. |

### Software / Application Layer

| Feature | Description |
|---|---|
| **Real-Time Telemetry** | Sensor data flows from ESP32 → MQTT → Backend → **Firebase Realtime Database** (time-series) and is pushed to the frontend via **Socket.io**. |
| **Interactive Dashboard** | React + TailwindCSS dashboard with live sensor cards (Distance, Colour, Temperature, Humidity), **Recharts** line/bar charts, and one-click actuator controls (Emergency Stop, Gate Toggle). |
| **Authentication &amp; Authorisation** | User registration and login secured with **bcrypt** password hashing and **JWT** tokens. Credentials stored in **PostgreSQL**. |
| **Predictive AI Module** | Python **FastAPI** service runs a **Scikit-Learn Linear Regression** model for peak-hour activity forecasting and an **Isolation Forest** anomaly detector for predictive maintenance alerts. |
| **Audit Logging** | All actuator actions (gate open/close, emergency stops) are recorded in the PostgreSQL `activity_logs` table for traceability. |

---

## Hardware Pin Mapping (Wokwi)

The simulation uses an **ESP32 DevKit v1 (wokwi/esp32-devkit-v1)** as the microcontroller.

| Peripheral | Signal | ESP32 GPIO | Wire Colour (Diagram) |
|---|---|---|---|
| HC-SR04 Ultrasonic | `TRIG` | **GPIO 12** | Orange |
| HC-SR04 Ultrasonic | `ECHO` | **GPIO 13** | Yellow |
| HC-SR04 Ultrasonic | `VCC` | VIN (5V) | Red |
| HC-SR04 Ultrasonic | `GND` | GND | Black |
| SG90 Servo Motor | `PWM` (signal) | **GPIO 18** | Blue |
| SG90 Servo Motor | `V+` | VIN (5V) | Red |
| SG90 Servo Motor | `GND` | GND | Black |
| Active Buzzer | `IN` | **GPIO 19** | Purple |
| Active Buzzer | `GND` | GND | Black |

> **Important:** The Wokwi IoT Gateway must be enabled in VS Code (`F1` → `Wokwi: Start IoT Gateway`) for the simulated ESP32 to reach the external MQTT broker (`broker.hivemq.com`).

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Simulation** | Wokwi for VS Code, ESP32 (Arduino core) |
| **Firmware** | C++ (Arduino), `WiFi.h`, `PubSubClient.h`, `Servo.h` |
| **Backend** | Node.js, Express.js, Socket.io, `mqtt` (MQTT.js), `pg` (node-postgres), `firebase-admin` |
| **Frontend** | React 18 (Vite), TailwindCSS, Recharts, Socket.io-client, React Router |
| **AI Module** | Python 3.10+, FastAPI, Scikit-Learn, NumPy, Uvicorn |
| **Databases** | PostgreSQL (auth, logs, relational) + Firebase Realtime Database (sensor time-series) |
| **Messaging** | MQTT (HiveMQ public broker) + WebSocket (Socket.io) |

---

## Directory Tree

```
warehouse-monitoring/
├── .env                          # Environment variables (all services)
├── .env.example                  # Template for .env
├── .gitignore
├── package.json                  # Root monorepo scripts
│
├── backend/
│   ├── server.js                 # Express + Socket.io + MQTT entry point
│   ├── package.json
│   ├── config/
│   │   ├── database.js           # PostgreSQL connection pool
│   │   └── firebase.js           # Firebase Admin SDK initialisation
│   ├── controllers/
│   │   └── authController.js     # Register / Login / Verify (bcrypt + JWT)
│   ├── middleware/
│   │   └── authMiddleware.js     # Bearer token verification
│   └── migrations/
│       └── 001_initial.sql       # users + activity_logs DDL
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js            # Vite proxy → backend :4000
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   └── src/
│       ├── main.jsx              # React DOM root + BrowserRouter
│       ├── App.jsx               # Route definitions
│       ├── index.css             # Tailwind directives + global styles
│       └── pages/
│           └── Dashboard.jsx     # Real-time dashboard + Recharts charts
│
├── ai-module/
│   ├── main.py                   # FastAPI app (peak-hour + anomaly detection)
│   └── requirements.txt          # Python dependencies
│
└── firmware/
    ├── diagram.json              # Wokwi wiring layout
    ├── wokwi.toml                # Wokwi project configuration
    └── firmware.ino              # ESP32 Arduino sketch
```

---

## Environment Variables Configuration

Create a `.env` file in the project root based on the template below:

```env
# ── PostgreSQL (Auth & Logs) ──
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=warehouse_db
PG_USER=warehouse_admin
PG_PASSWORD=change_me_in_production

# ── Firebase Admin SDK ──
# 1. Go to Firebase Console → Project Settings → Service Accounts
# 2. Click "Generate new private key" → save as backend/config/serviceAccountKey.json
# 3. Set your Realtime Database URL below
FIREBASE_SERVICE_ACCOUNT_PATH=./config/serviceAccountKey.json
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# ── MQTT Broker ──
# Default: HiveMQ public broker (no auth required)
MQTT_BROKER_URL=mqtt://broker.hivemq.com
MQTT_USERNAME=
MQTT_PASSWORD=

# ── JWT Secret ──
# Replace with a strong random string in production
JWT_SECRET=your_256bit_random_secret_key_here

# ── Server ──
PORT=4000
CORS_ORIGIN=http://localhost:5173

# ── AI Module ──
AI_SERVICE_URL=http://localhost:8000
```

> **Firebase Setup Note:** The `serviceAccountKey.json` file is **never committed to Git**. It is listed in `.gitignore`. You must generate it from the Firebase Console and place it in `backend/config/` before starting the backend.

---

## Data Flow &amp; Architecture

### Telemetry Flow (Sensor → Dashboard)

```
┌──────────┐    MQTT      ┌──────────────┐   Firebase   ┌───────────────┐
│  ESP32   │──────────────▶│   Backend    │─────────────▶│  Firebase RTDB │
│ (Wokwi)  │ warehouse/    │  (server.js) │              │   (time-series)│
│          │  sensors      │              │              └───────────────┘
└──────────┘               │    Socket.io │
                           │    emit()    │
                           └──────┬───────┘
                                  │  "sensor-data"
                                  ▼
                        ┌──────────────────┐
                        │  React Dashboard │
                        │  (Dashboard.jsx) │
                        └──────────────────┘
```

1. ESP32 reads HC-SR04 distance, generates a random colour label.
2. Firmware publishes `{"distance": 42.3, "color": "RED"}` to MQTT topic `warehouse/sensors`.
3. Backend `server.js` receives the message via its MQTT subscriber.
4. Backend **writes** the reading to Firebase Realtime Database under `sensors/esp32/{timestamp}`.
5. Backend **emits** the payload to all connected frontend clients via Socket.io event `sensor-data`.
6. Dashboard updates live sensor cards and appends data points to Recharts charts.

### Command Flow (Dashboard → Actuator)

```
┌──────────────────┐   Socket.io    ┌──────────────┐     MQTT      ┌──────────┐
│  React Dashboard │───────────────▶│   Backend    │──────────────▶│  ESP32   │
│                  │  actuator-     │  (server.js) │ warehouse/    │ (Wokwi)  │
│                  │  command       │              │  actuators    │          │
└──────────────────┘                └──────────────┘               └─────┬────┘
                                                                         │
                                                                    ┌────▼─────┐
                                                                    │  Servo   │
                                                                    │  Buzzer  │
                                                                    └──────────┘
```

1. User clicks a control button on the dashboard (Emergency Stop, Open/Close Gate).
2. Dashboard emits a Socket.io event (`emergency-stop`, `gate-trigger`, or `actuator-command`).
3. Backend receives the event and publishes a JSON command to MQTT topic `warehouse/actuators`.
4. ESP32 firmware receives the command, parses it (supports both raw strings and JSON), and actuates the servo motor and/or buzzer accordingly.

### REST API Fallback

Actuator commands can also be sent via HTTP POST to `/api/actuators` (JWT-authenticated). This provides a fallback for non-WebSocket clients.

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| **Node.js** | ≥ 18 LTS | Backend &amp; Frontend runtime |
| **Python** | ≥ 3.10 | AI Module (FastAPI) |
| **PostgreSQL** | ≥ 14 | Auth &amp; audit logs database |
| **VS Code** | Latest | IDE with Wokwi extension |
| **Wokwi for VS Code** | Latest | ESP32 hardware simulation |

---

### Step 1 — Install Dependencies

From the project root:

```bash
npm run install:all
```

This installs:
- Backend packages (`express`, `socket.io`, `mqtt`, `pg`, `bcrypt`, `firebase-admin`, `jsonwebtoken`, …)
- Frontend packages (`react`, `react-dom`, `recharts`, `socket.io-client`, `tailwindcss`, `vite`, …)
- Python packages (`fastapi`, `uvicorn`, `scikit-learn`, `numpy`, `pydantic`)

---

### Step 2 — Initialise PostgreSQL

1. Create the database:

```sql
CREATE DATABASE warehouse_db;
CREATE USER warehouse_admin WITH ENCRYPTED PASSWORD 'change_me_in_production';
GRANT ALL PRIVILEGES ON DATABASE warehouse_db TO warehouse_admin;
```

2. Run the migration:

```bash
psql -U warehouse_admin -d warehouse_db -f backend/migrations/001_initial.sql
```

This creates the `users` and `activity_logs` tables.

---

### Step 3 — Configure Firebase

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a project (or use an existing one).
3. Navigate to **Project Settings → Service Accounts**.
4. Click **Generate new private key** and download the JSON file.
5. Rename it to `serviceAccountKey.json` and place it in `backend/config/`.
6. In your `.env`, set `FIREBASE_DATABASE_URL` to your Realtime Database URL (found under **Build → Realtime Database**).

---

### Step 4 — Launch Wokwi Simulation

1. Open the project in **VS Code**.
2. Open the `firmware/` folder in the workspace.
3. Start the **Wokwi IoT Gateway**:

   > Press `F1` → type `Wokwi: Start IoT Gateway` → press Enter.

   The IoT Gateway bridges the simulated ESP32's virtual WiFi network to the public internet, allowing it to reach `broker.hivemq.com`.

4. Start the hardware simulation:

   > Press `F1` → type `Wokwi: Start Simulation` → press Enter.

   The simulation will open in a new tab. The ESP32 will:
   - Boot and connect to WiFi
   - Connect to the MQTT broker
   - Begin publishing sensor data every 2 seconds
   - Listen for actuator commands

---

### Step 5 — Start Application Services

Open **three separate terminals** and run each command from the project root:

**Terminal 1 — Backend API Server:**

```bash
npm run dev:backend
```

Starts on **http://localhost:4000**. You should see MQTT and PostgreSQL connection logs.

**Terminal 2 — AI Prediction Module:**

```bash
npm run dev:ai
```

Starts on **http://localhost:8000**. Access the interactive API docs at http://localhost:8000/docs.

**Terminal 3 — Frontend Dashboard:**

```bash
npm run dev:frontend
```

Starts on **http://localhost:5173**. Open this URL in your browser to view the dashboard.

---

### Step 6 — Verify the System

1. Open **http://localhost:5173** — the dashboard should show a green "Live" badge.
2. The sensor cards (Distance, Detected Color) should update every 2 seconds.
3. The Recharts line/bar charts should accumulate real-time data points.
4. Click **Open Gate** — the simulated servo in Wokwi should rotate to 90°.
5. Click **Emergency Stop** — the servo resets to 0° and the buzzer sounds for 1 second.
6. To test the AI module, open **http://localhost:8000/docs** and try:
   - `GET /predict/peak-hour?hour=14`
   - `POST /predict/maintenance-alert` with a sample reading body.

---

## API Reference

### Backend REST API (`http://localhost:4000`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check (uptime, status) |
| `POST` | `/api/auth/register` | — | Register new user `{username, email, password}` |
| `POST` | `/api/auth/login` | — | Login, returns JWT `{email, password}` |
| `POST` | `/api/auth/verify` | Bearer | Verify token validity |
| `POST` | `/api/actuators` | Bearer | Send actuator command `{command, ...}` |

### AI Module API (`http://localhost:8000`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service health check |
| `GET` | `/predict/peak-hour?hour=14` | Predict activity level for a given hour (0–23) |
| `POST` | `/predict/maintenance-alert` | Anomaly detection on batch of sensor readings |

---

## MQTT Topic Specification

| Topic | Direction | Payload Format |
|---|---|---|
| `warehouse/sensors` | ESP32 → Backend | `{"distance":42.3,"color":"RED"}` |
| `warehouse/actuators` | Backend → ESP32 | `{"command":"gate_open","timestamp":"..."}` or raw `"GATE_OPEN"` |

**Supported actuator commands:**

| Command | Effect |
|---|---|
| `GATE_OPEN` / `gate_open` | Servo rotates to 90° |
| `GATE_CLOSE` / `gate_close` | Servo rotates to 0° |
| `EMERGENCY_STOP` / `emergency_stop` | Servo returns to 0°, buzzer sounds 1 s |
