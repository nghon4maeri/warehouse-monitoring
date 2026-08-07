# Smart Warehouse Monitoring System

An IoT-based smart warehouse monitoring and automated goods sorting system. PHY00007 Project - Internet of Things

![Data Flow](docs/pipeline.png)

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