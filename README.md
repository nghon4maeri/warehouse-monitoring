# IoT & AI-Integrated Smart Warehouse Monitoring System

**Real-time sensor telemetry, actuator control, JWT authentication, PostgreSQL persistence, and Firebase backup — all containerised with Docker Compose.**

---

## Project Overview

This is a full-stack **Industry 4.0** simulation platform that replicates a smart warehouse environment. An ESP32 microcontroller (simulated via **Wokwi for VS Code**) streams ultrasonic distance readings and colour-detection events over MQTT. A Node.js backend ingests the data, persists it to **PostgreSQL** and **Firebase Realtime Database**, and pushes it live to a React dashboard via **Socket.io**. Users authenticate with **JWT + bcrypt**, and an optional **Python/FastAPI AI module** provides peak-hour forecasting and anomaly detection.

### Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 7, TailwindCSS 3, Recharts 2, Socket.io-client |
| **Serving (prod)** | Nginx Alpine (reverse proxy + static files) |
| **Backend** | Node.js 20, Express 4, Socket.io 4, MQTT.js 5 |
| **Database** | PostgreSQL 15 Alpine (auth, audit logs) |
| **Realtime DB** | Firebase Realtime Database (sensor time-series) |
| **Auth** | bcrypt + JSON Web Token (JWT) |
| **AI Module** | Python 3.10+, FastAPI, Scikit-Learn, Uvicorn |
| **IoT Simulator** | Wokwi for VS Code — ESP32 DevKit + HC-SR04 + Servo + Buzzer |
| **Messaging** | MQTT (HiveMQ public broker) |
| **DevOps** | Docker, Docker Compose, multi-stage builds |

### Core Features

- **Live Telemetry Dashboard** — distance, detected colour, temperature, humidity cards updated in real time
- **Time-Series Charts** — Recharts line/bar charts showing distance over time, colour distribution, and temperature/humidity trends
- **Remote Actuator Control** — one-click Emergency Stop and Gate Open/Close from the dashboard, forwarded to ESP32 via MQTT
- **JWT Authentication** — register and login with bcrypt-hashed credentials stored in PostgreSQL
- **Route Guarding** — unauthenticated users are redirected to the login page
- **Firebase Backup** — every sensor reading is persisted to Firebase Realtime Database (gracefully skips if unconfigured)
- **Audit Trail** — actuator commands logged in `activity_logs` table
- **AI Analytics** — REST endpoints for peak-hour activity prediction and anomaly detection

---

## Prerequisites

Install the following on your local machine:

| Tool | Minimum Version | Purpose |
|---|---|---|
| **Docker Desktop** | 4.x + | Container runtime |
| **Node.js** | v20+ | Local development (optional — Docker builds use Node 20 Alpine) |
| **Git** | 2.x + | Clone the repository |
| **VS Code** | Latest | Optional — for Wokwi simulation |
| **Wokwi for VS Code** | Latest | Optional — ESP32 hardware simulation |

> **Note:** An internet-accessible MQTT broker is required. The project defaults to the free public broker at `broker.hivemq.com:1883`. Replace with your own broker in `.env` if needed.

---

## Credentials & Environment Setup

### Step 1 — Create the `.env` File

Copy the template below into a file named `.env` in the **project root**:

```env
# ── PostgreSQL (Auth & Logs) ──
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=warehouse_db
PG_USER=warehouse_admin
PG_PASSWORD=change_me_in_production

# ── Firebase Admin (Realtime Sensor DB) ──
FIREBASE_SERVICE_ACCOUNT_PATH=./config/serviceAccountKey.json
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# ── MQTT Broker ──
MQTT_BROKER_URL=mqtt://broker.hivemq.com
MQTT_USERNAME=
MQTT_PASSWORD=

# ── JWT Secret (replace with a strong random string!) ──
JWT_SECRET=your_256bit_random_secret_key_here

# ── Server ──
PORT=4000
CORS_ORIGIN=http://localhost:5173

# ── AI Module (optional) ──
AI_SERVICE_URL=http://localhost:8000
```

> **Important:** `docker-compose.yml` overrides `PG_HOST` to `db` (the Docker service name) and `CORS_ORIGIN` to `*` automatically. You do **not** need to change those for Docker deployment.

### Step 2 — Firebase Service Account (Optional but Recommended)

Sensor data persistence to Firebase will be **silently skipped** if no credentials are provided — the dashboard and MQTT relay still work perfectly. To enable Firebase:

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Open your project → **Project Settings** → **Service accounts**.
3. Click **Generate new private key** and download the JSON file.
4. Rename the downloaded file to **`serviceAccountKey.json`**.
5. Place it inside **`backend/config/`**.

```
backend/config/serviceAccountKey.json    ← never committed to Git
```

Docker Compose automatically mounts this file into the container at runtime via a volume binding (`./backend/config/serviceAccountKey.json:/app/config/serviceAccountKey.json:ro`). No rebuild is needed when updating the key — just restart the stack.

---

## How to Start the Project

### First-Time Build

```bash
docker compose up --build
```

This command:
1. Pulls `postgres:15-alpine` and `nginx:alpine` base images
2. Builds the **backend** image (Node 20 Alpine + native addons)
3. Builds the **frontend** image (multi-stage: Vite build → Nginx serve)
4. Starts all three services in dependency order (`db` → `backend` → `frontend`)
5. Runs PostgreSQL migrations automatically on first launch

Wait for the output:

```
✔ Container warehouse-db        Healthy
✔ Container warehouse-backend   Started
✔ Container warehouse-frontend  Started
```

### Subsequent Starts

```bash
docker compose up -d
```

The `-d` flag runs containers in detached (background) mode.

### Local Endpoints

| Service | URL | Notes |
|---|---|---|
| **Frontend Dashboard** | http://localhost | Nginx serves the React SPA |
| **Backend API** | http://localhost:4000 | Express + Socket.io |
| **Health Check** | http://localhost:4000/api/health | Returns `{ "status":"ok", "uptime":… }` |
| **PostgreSQL** | `localhost:5432` | Connect with your favourite DB client |

### Quick Test After Startup

```bash
# Health check
curl http://localhost:4000/api/health

# Register a test user
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@warehouse.local","password":"admin123"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@warehouse.local","password":"admin123"}'
```

Then open **http://localhost** in your browser and sign in.

---

## Wokwi Simulator Connectivity

The project includes a complete Wokwi simulation in the `firmware/` directory. The ESP32 firmware:

1. Connects to WiFi `Wokwi-GUEST`
2. Connects to the MQTT broker (`broker.hivemq.com:1883`)
3. Reads the HC-SR04 ultrasonic sensor every 2 seconds
4. Generates a random colour label (`RED`, `BLUE`, `GREEN`, or `NONE`)
5. Publishes JSON to **`warehouse/sensors`**
6. Subscribes to **`warehouse/actuators`** for remote commands

### MQTT Topics

| Topic | Direction | Payload Example |
|---|---|---|
| `warehouse/sensors` | ESP32 → Backend | `{"distance":42.3,"color":"RED"}` |
| `warehouse/actuators` | Backend → ESP32 | `{"command":"gate_open","timestamp":"…"}` |

### Starting the Simulator

1. Install the **Wokwi for VS Code** extension
2. Open the `firmware/` folder in VS Code
3. Press `F1` → **Wokwi: Start IoT Gateway** (this bridges the virtual ESP32 to the internet)
4. Press `F1` → **Wokwi: Start Simulation**

The ESP32 will boot, connect, and begin publishing data. You should see live updates appear on the dashboard at **http://localhost**.

> **Note:** The Wokwi simulation is **independent** of Docker. It communicates with the backend solely through the MQTT broker — no direct network link is needed between Wokwi and your containers.

### Testing Without Wokwi

You can publish synthetic sensor data directly to the MQTT broker using any MQTT client (e.g., MQTTX, `mosquitto_pub`, or Node-RED):

```bash
mosquitto_pub -h broker.hivemq.com -t "warehouse/sensors" \
  -m '{"distance":35.2,"color":"BLUE","temperature":24.5,"humidity":62}'
```

---

## Verification & Development Commands

### Inspect the Database

```bash
# List all tables
docker compose exec db psql -U warehouse_admin -d warehouse_db -c "\dt"

# View registered users
docker compose exec db psql -U warehouse_admin -d warehouse_db -c "SELECT id, username, email, role, created_at FROM users;"

# View recent activity logs
docker compose exec db psql -U warehouse_admin -d warehouse_db -c "SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10;"
```

### View Container Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
```

### Rebuild a Single Service After Code Changes

```bash
docker compose up -d --build backend
docker compose up -d --build frontend
```

### Stop & Clean Up

```bash
# Stop all containers (keeps volumes)
docker compose down

# Stop all containers AND delete the PostgreSQL volume (fresh start)
docker compose down -v
```

### Restart Everything Fresh

```bash
docker compose down -v
docker compose up --build -d
```

### Local Frontend Development (without Docker)

If you prefer running the frontend locally for hot-reload during UI development:

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173 (Vite dev server proxies /api to localhost:4000)
```

Keep the Docker backend running alongside it:
```bash
docker compose up -d db backend
```
---