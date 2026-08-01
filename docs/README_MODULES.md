# README — Module Assignment & Team Workflow

**Dự án:** Hệ thống Trạm phân loại hàng hóa và Giám sát kho thông minh  
**Phiên bản:** v2 (Modularised)  
**Ngày:** 2026-08-01

---

## 1. Cấu trúc thư mục (sau refactor)

```
warehouse-monitoring/
├── firmware/                          # ESP32 — Wokwi Simulation
│   ├── firmware.ino                   # Main orchestrator (WiFi + MQTT + loop)
│   ├── ultrasonic_sensor.h            # ─── Nguyễn Hồ Nam ───
│   ├── ultrasonic_sensor.cpp          # HC-SR04 distance + dwell time
│   ├── loadcell_sensor.h              # ── Trần Hoàng Minh Khang ──
│   ├── loadcell_sensor.cpp            # HX711 weight reading + calibration
│   ├── actuators.h                    # ──── Đàng Thế Tony ────
│   ├── actuators.cpp                  # Servo SG90 + Buzzer control
│   ├── diagram.json                   # Wokwi schematic (all team)
│   └── wokwi.toml
│
├── backend/                           # Node.js / Express API Server
│   ├── server.js                      # Main orchestrator (Express + Socket.io + routes)
│   ├── config/
│   │   ├── database.js                # PostgreSQL connection pool
│   │   ├── firebase.js                # Firebase Admin SDK init
│   │   └── serviceAccountKey.json     # Firebase private key (gitignored)
│   ├── controllers/
│   │   ├── authController.js          # JWT auth (register/login/verify)
│   │   └── sensorController.js        # ─── Nguyễn Hồ Nam ───
│   ├── middleware/
│   │   └── authMiddleware.js          # JWT Bearer token verify
│   ├── services/
│   │   ├── firebaseService.js         # ─── Nguyễn Hồ Nam ───
│   │   ├── aiService.js               # ── Trần Hoàng Minh Khang ──
│   │   ├── mqttService.js             # ──── Đàng Thế Tony ────
│   │   └── notificationService.js     # ──── Đàng Thế Tony ────
│   ├── migrations/
│   │   └── 001_initial.sql
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                          # React + Vite + TailwindCSS
│   └── src/pages/Dashboard.jsx        # AI classification + anomaly banner
│
├── ai-module/                         # Python FastAPI Micro-service
│   └── main.py                        # DecisionTreeClassifier + IsolationForest
│
├── docs/
│   ├── WOKWI_TESTING_GUIDE.md         # Hướng dẫn test Wokwi
│   └── README_MODULES.md              # File này
│
├── docker-compose.yml
├── .env / .env.example
└── package.json
```

---

## 2. Phân công Module theo thành viên

### 2.1 Nguyễn Hồ Nam — Luồng Cảm biến Siêu âm + Firebase + Charts

| File | Mô tả | Ngôn ngữ |
|---|---|---|
| `firmware/ultrasonic_sensor.h` | Khai báo HC-SR04 (TRIG=5, ECHO=18), function prototypes | C++ (Arduino) |
| `firmware/ultrasonic_sensor.cpp` | Logic đo khoảng cách `pulseIn()`, tính `dwell_time_sec` | C++ (Arduino) |
| `backend/services/firebaseService.js` | Lưu sensor data vào Firebase RTDB, truy xuất lịch sử | JavaScript |
| `backend/controllers/sensorController.js` | Tiếp nhận MQTT data, gọi AI, phát Socket.io `sensor-data` + `sensor-ai-update` | JavaScript |

**Nhiệm vụ chính:**
- Đọc + tính khoảng cách từ HC-SR04 và dwell time
- Lưu time-series sensor data vào Firebase Realtime Database
- Phát real-time dữ liệu lên frontend qua Socket.io
- Điều phối gọi AI service và xử lý phản hồi

---

### 2.2 Trần Hoàng Minh Khang — Luồng Cảm biến Trọng lượng + Web Server + AI Engine

| File | Mô tả | Ngôn ngữ |
|---|---|---|
| `firmware/loadcell_sensor.h` | Khai báo HX711 (DOUT=32, SCK=33), function prototypes | C++ (Arduino) |
| `firmware/loadcell_sensor.cpp` | Hiệu chuẩn `set_scale()`, `tare()`, đọc `weight_g` | C++ (Arduino) |
| `backend/services/aiService.js` | Gọi `POST /predict` đến Python FastAPI, nhận kết quả phân loại | JavaScript |
| `ai-module/main.py` | DecisionTreeClassifier + IsolationForest, endpoint `/predict` | Python |
| `ai-module/requirements.txt` | Dependencies: fastapi, uvicorn, scikit-learn, numpy, pydantic | — |

**Nhiệm vụ chính:**
- Đọc khối lượng từ Loadcell qua HX711
- Huấn luyện + triển khai model ML phân loại Light/Medium/Heavy
- API endpoint cho backend gọi AI dự báo
- Cấu hình FastAPI + Uvicorn server

---

### 2.3 Đàng Thế Tony — Luồng Điều khiển, Bảo mật & Cảnh báo

| File | Mô tả | Ngôn ngữ |
|---|---|---|
| `firmware/actuators.h` | Khai báo Servo (GPIO19) + Buzzer (GPIO21), function prototypes | C++ (Arduino) |
| `firmware/actuators.cpp` | Điều khiển Servo 4 góc (0°/45°/90°/135°) + Buzzer beep pattern | C++ (Arduino) |
| `backend/services/mqttService.js` | Khởi tạo MQTT client, subscribe `warehouse/sensors`, publish `warehouse/actuators` | JavaScript |
| `backend/services/notificationService.js` | Gửi cảnh báo qua Telegram Bot API + Nodemailer (Email) | JavaScript |

**Nhiệm vụ chính:**
- Điều khiển Servo gạt hàng theo lệnh AI (`gate_light/medium/heavy`)
- Điều khiển Buzzer báo động (`alarm_on/off`)
- Quản lý kết nối MQTT Broker (HiveMQ)
- Gửi cảnh báo tức thì qua Telegram + Email khi phát hiện anomaly

---

## 3. Tệp dùng chung (Shared)

| File | Người phụ trách | Mô tả |
|---|---|---|
| `firmware/firmware.ino` | **Cả team** | Main orchestrator: WiFi + MQTT + loop gọi các module |
| `firmware/diagram.json` | **Nam / Tony** | Sơ đồ kết nối Wokwi (visual wiring) |
| `backend/server.js` | **Khang / Tony** | Express + Socket.io + routes + MQTT init |
| `backend/config/database.js` | **Khang** | PostgreSQL connection pool |
| `backend/config/firebase.js` | **Nam** | Firebase Admin SDK init |
| `backend/controllers/authController.js` | **Tony** | JWT auth (register/login/verify) |
| `backend/middleware/authMiddleware.js` | **Tony** | Bearer token verify |
| `backend/migrations/001_initial.sql` | **Khang** | Database schema |
| `frontend/src/pages/Dashboard.jsx` | **Nam** | Dashboard UI + charts + anomaly banner |
| `.env` / `.env.example` | **Cả team** | Environment variables |
| `docker-compose.yml` | **Khang** | Docker orchestration |
| `docs/WOKWI_TESTING_GUIDE.md` | **Tony** | Hướng dẫn test Wokwi |

---

## 4. Cách làm việc độc lập (Independent Workflow)

Mỗi thành viên có thể phát triển module của mình mà không ảnh hưởng đến người khác:

### Nguyễn Hồ Nam
```bash
# Chỉ cần code trong các file này:
# firmware/ultrasonic_sensor.h
# firmware/ultrasonic_sensor.cpp
# backend/services/firebaseService.js
# backend/controllers/sensorController.js

# Test firmware:
# 1. Mở Wokwi → chạy simulation
# 2. Theo dõi Serial Monitor: [SENSOR] HC-SR04: ...

# Test backend:
cd backend && npm run dev
curl http://localhost:4000/api/health
```

### Trần Hoàng Minh Khang
```bash
# Chỉ cần code trong các file này:
# firmware/loadcell_sensor.h
# firmware/loadcell_sensor.cpp
# backend/services/aiService.js
# ai-module/main.py

# Test AI module:
cd ai-module && python main.py
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"weight_g":500,"distance_cm":8,"dwell_time_sec":2}'

# Test firmware:
# 1. Mở Wokwi → chạy simulation
# 2. Click vào chip HX711 → chỉnh weight slider
```

### Đàng Thế Tony
```bash
# Chỉ cần code trong các file này:
# firmware/actuators.h
# firmware/actuators.cpp
# backend/services/mqttService.js
# backend/services/notificationService.js

# Test MQTT (gửi lệnh thủ công):
mosquitto_pub -h broker.hivemq.com -t "warehouse/actuators" \
  -m '{"command":"gate_light"}'

# Test Telegram (gửi test alert):
# Cấu hình TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID trong .env
# Khi có anomaly → bot sẽ gửi message vào chat
```

---

## 5. Giao tiếp giữa các Module (Interfaces)

### Firmware → Backend (MQTT)

| Từ module | Topic | Payload |
|---|---|---|
| `ultrasonic_sensor.cpp` | `warehouse/sensors` | `{"deviceId":"STATION_01","distance_cm":...,"weight_g":...,"dwell_time_sec":...}` |
| `loadcell_sensor.cpp` | (góp vào payload trên) | (cùng payload, được `firmware.ino` gom lại) |

### Backend → Firmware (MQTT)

| Từ module | Topic | Payload |
|---|---|---|
| `mqttService.js` | `warehouse/actuators` | `{"command":"gate_light\|gate_medium\|gate_heavy\|gate_close\|alarm_on\|alarm_off"}` |

### Backend Internal (function calls)

| Gọi từ | Gọi đến | Mục đích |
|---|---|---|
| `sensorController.js` | `firebaseService.js` | `saveSensorReading(payload)` |
| `sensorController.js` | `aiService.js` | `predictCargo(payload)` → AI response |
| `sensorController.js` | `mqttService.js` | `publishActuator(command)` |
| `sensorController.js` | `notificationService.js` | `sendTelegramAlert()`, `sendEmailAlert()` |
| `sensorController.js` | Socket.io (`io`) | `io.emit('sensor-data')`, `io.emit('sensor-ai-update')` |
| `server.js` | `mqttService.js` | `initMQTT()`, `onSensorData()`, `publishActuator()` |
| `server.js` | `sensorController.js` | `setIO(io)` |

### Frontend ← Backend (Socket.io)

| Event | Dữ liệu | Module phát |
|---|---|---|
| `sensor-data` | Raw sensor readings | `sensorController.js` |
| `sensor-ai-update` | Sensor + AI result (category, is_anomaly, anomaly_reason) | `sensorController.js` |
| `history-data` | Last 50 records from Firebase | `sensorController.js` (qua `firebaseService.js`) |

---

## 6. Kiểm tra code (Lint & Test)

```bash
# Backend
cd backend && node -e "require('./server.js')"  # Kiểm tra load đúng

# AI Module
cd ai-module && python -c "import main"          # Kiểm tra import OK

# Frontend
cd frontend && npm run build                     # Build production

# Full integration test (cần chạy tuần tự 3 terminal):
# Terminal 1: docker compose up -d db     (hoặc PostgreSQL local)
# Terminal 2: cd backend && npm run dev
# Terminal 3: cd ai-module && python main.py
# Terminal 4: cd frontend && npm run dev
# Wokwi: F1 → Start IoT Gateway → Start Simulation
```