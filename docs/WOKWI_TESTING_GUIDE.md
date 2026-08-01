# Wokwi Simulation Testing Guide

## Smart Warehouse Sorting Station — ESP32 + AI Integration

Tài liệu này hướng dẫn từng bước để chạy mô phỏng phần cứng ESP32 trên **Wokwi Simulator** và test toàn bộ luồng dữ liệu end-to-end từ cảm biến đến AI phân loại hàng hóa.

---

## Prerequisites

| Công cụ | Phiên bản | Mục đích |
|---|---|---|
| Visual Studio Code | Latest | IDE chính |
| Wokwi for VS Code Extension | Latest | Mô phỏng ESP32 |
| Docker Desktop | 4.x+ | Chạy backend + database (không bắt buộc nếu chạy local) |
| Node.js | 20+ | Chạy backend local (thay cho Docker) |
| Python | 3.10+ | Chạy AI Module |

---

## 1. Cấu trúc Pin (Sơ đồ kết nối)

| Linh kiện | Chân ESP32 | Màu dây | Ghi chú |
|---|---|---|---|
| HC-SR04 VCC | VIN (5V) | Red | |
| HC-SR04 GND | GND | Black | |
| HC-SR04 TRIG | GPIO 5 | Orange | |
| HC-SR04 ECHO | GPIO 18 | Yellow | |
| HX711 VCC | 3V3 | Red | |
| HX711 GND | GND | Black | |
| HX711 DOUT | GPIO 32 | Green | Data signal |
| HX711 SCK | GPIO 33 | Blue | Clock signal |
| Servo SG90 V+ | VIN (5V) | Red | |
| Servo SG90 GND | GND | Black | |
| Servo SG90 PWM | GPIO 19 | Blue | |
| Buzzer VCC | GPIO 21 | Purple | Active buzzer |
| Buzzer GND | GND | Black | |

> **Lưu ý:** File `firmware/diagram.json` đã được cấu hình sẵn, không cần nối dây thủ công.

---

## 2. Khởi động Hệ thống Backend

### 2.1 Chạy Backend + Database

**Cách A — Docker (khuyến nghị):**
```bash
# Từ thư mục gốc project
docker compose up -d db backend
```

**Cách B — Chạy local:**
```bash
# Terminal 1: Chạy backend Node.js
cd backend
npm run dev

# Terminal 2: Chạy AI Module (Python)
cd ai-module
python main.py
```

### 2.2 Kiểm tra trạng thái

```bash
# Health check backend
curl http://localhost:4000/api/health

# Health check AI module
curl http://localhost:8000/
```

Kết quả mong đợi:
```
Backend:  { "status": "ok", "uptime": ... }
AI:       { "service": "warehouse-ai", "status": "ok", "version": "2.0.0" }
```

### 2.3 Khởi động Frontend
```bash
cd frontend
npm run dev
# → http://localhost:5173
```

Đăng nhập với tài khoản mặc định: `admin@warehouse.local` / `admin123`

---

## 3. Khởi động Wokwi Simulator

### Bước 1: Mở firmware trong VS Code
1. Mở thư mục `firmware/` trong VS Code
2. File `firmware.ino` và `diagram.json` sẽ tự động được load

### Bước 2: Khởi động Wokwi IoT Gateway
1. Nhấn `F1` (hoặc `Ctrl+Shift+P`)
2. Gõ: **Wokwi: Start IoT Gateway**
3. Gateway sẽ bridge ESP32 ảo ra internet thật (cần thiết để kết nối MQTT tới `broker.hivemq.com`)

> Gateway console sẽ hiển thị log: `IoT Gateway listening on port 9011...`

### Bước 3: Khởi động Simulation
1. Nhấn `F1` → **Wokwi: Start Simulation**
2. Cửa sổ simulation sẽ mở ra hiển thị:
   - 1x ESP32 DevKit V1
   - 1x HC-SR04 Ultrasonic Sensor
   - 1x HX711 Loadcell Module
   - 1x SG90 Servo Motor
   - 1x Active Buzzer

### Bước 4: Theo dõi Serial Monitor
Sau khi simulation khởi động, Serial Monitor (tab dưới VS Code) sẽ hiển thị:
```
========================================
 Smart Warehouse — ESP32 Firmware v2
========================================
[INIT] Servo attached — gate CLOSED
[INIT] Loadcell HX711 calibrated & tared
[WiFi] Connecting to Wokwi-GUEST …
[WiFi] Connected — IP: 10.10.0.2
[MQTT] Connected
[MQTT] Subscribed to warehouse/actuators
[READY] Firmware initialised successfully

[MQTT TX] warehouse/sensors → {"deviceId":"STATION_01","distance_cm":...}
```

---

## 4. Các Kịch bản Test (5 Scenarios)

Mỗi kịch bản mô phỏng một luồng phân loại hàng hóa thực tế. Kết quả mong đợi bao gồm:
- **ESP32:** Servo quay đúng góc, Buzzer kêu (nếu anomaly)
- **Serial Monitor:** Log gửi MQTT và nhận lệnh điều khiển
- **Frontend Dashboard:** Hiển thị real-time dữ liệu + kết quả AI
- **AI Response:** Log prediction category, anomaly status

---

### Scenario 1: Phân loại Hàng Nhẹ — Light (< 250g)

**Mục tiêu:** Servo quay 45°, hàng được gạt vào ngăn Light.

**Thao tác trên Wokwi:**

| Bước | Hành động |
|---|---|
| 1.1 | Click vào **HC-SR04** sensor → kéo **distance slider** về `< 15cm` (ví dụ: `8cm`). |
| 1.2 | Click vào chip **HX711** → chỉnh **weight** value thành `150g`. |
| 1.3 | Giữ distance `< 15cm` trong ~2 giây để ESP32 tính dwell time. |

**Kết quả mong đợi:**

| Thành phần | Minh chứng |
|---|---|
| Serial Monitor | `[MQTT TX] warehouse/sensors → {"deviceId":"STATION_01","distance_cm":8.0,"weight_g":150.0,"dwell_time_sec":2.0}` |
| Serial Monitor | `[MQTT RX] Topic: warehouse/actuators | Payload: {"command":"gate_light"}` |
| Servo SG90 | Quay đến góc **45°** |
| AI Log (Terminal AI) | `Prediction → category=Light, anomaly=False, action=SORT_LIGHT` |
| Frontend Card | `AI Classification: Light` (viền vàng) |
| Frontend Chart | Weight chart hiển thị ~150g |

---

### Scenario 2: Phân loại Hàng Trung Bình — Medium (250g – 750g)

**Mục tiêu:** Servo quay 90°, hàng được gạt vào ngăn Medium.

**Thao tác trên Wokwi:**

| Bước | Hành động |
|---|---|
| 2.1 | Kéo **distance slider** HC-SR04 về `10cm` (dưới 15cm). |
| 2.2 | Chỉnh **HX711 weight** thành `500g`. |
| 2.3 | Giữ ~2 giây, sau đó kéo distance về `> 20cm` để reset. |

**Kết quả mong đợi:**

| Thành phần | Minh chứng |
|---|---|
| Serial Monitor | `[MQTT RX] Payload: {"command":"gate_medium"}` |
| Servo SG90 | Quay đến góc **90°** |
| AI Log | `category=Medium, action=SORT_MEDIUM` |
| Frontend Card | `AI Classification: Medium` |

---

### Scenario 3: Phân loại Hàng Nặng — Heavy (> 750g)

**Mục tiêu:** Servo quay 135°, hàng được gạt vào ngăn Heavy.

**Thao tác trên Wokwi:**

| Bước | Hành động |
|---|---|
| 3.1 | Kéo **distance slider** HC-SR04 về `12cm`. |
| 3.2 | Chỉnh **HX711 weight** thành `900g`. |
| 3.3 | Giữ ~2 giây, sau đó kéo distance về `> 20cm` để reset. |

**Kết quả mong đợi:**

| Thành phần | Minh chứng |
|---|---|
| Serial Monitor | `[MQTT RX] Payload: {"command":"gate_heavy"}` |
| Servo SG90 | Quay đến góc **135°** |
| AI Log | `category=Heavy, action=SORT_HEAVY` |
| Frontend Card | `AI Classification: Heavy` |

---

### Scenario 4: Giả lập Kẹt Hàng — Jam Detection (Anomaly)

**Mục tiêu:** Sau 7 giây vật thể không rời khỏi trạm, hệ thống phát hiện kẹt hàng → Buzzer báo động, Telegram/Email gửi cảnh báo.

**Thao tác trên Wokwi:**

| Bước | Hành động |
|---|---|
| 4.1 | Kéo **distance slider** HC-SR04 về `7cm`. |
| 4.2 | Chỉnh **HX711 weight** thành `300g`. |
| 4.3 | **Giữ nguyên distance < 15cm trong hơn 7 giây** (quan trọng!). |
| 4.4 | Theo dõi Serial Monitor để thấy `dwell_time_sec` tăng dần. |

**Kết quả mong đợi:**

| Thành phần | Minh chứng |
|---|---|
| Serial Monitor | `dwell_time_sec` vượt `7.0`, AI trả về `is_anomaly: true` |
| Serial Monitor | `[MQTT RX] Payload: {"command":"alarm_on"}` |
| Buzzer | **Bíp ngắt quãng** (500ms ON / 500ms OFF) |
| AI Log | `JAM DETECTED: object stalled for X.Xs` |
| Frontend Banner | **ANOMALY DETECTED** (đỏ, nhấp nháy) + reason: "JAM DETECTED: object stalled for..." |
| Telegram (nếu cấu hình) | `<b>WAREHOUSE ALERT</b> ... Issue: JAM DETECTED` |
| Email (nếu cấu hình) | Subject: `[Warehouse Alert] JAM DETECTED: ...` |

> **Để tắt alarm:** Backend sẽ tự publish `alarm_off` sau ~5 giây. Hoặc gửi lệnh MQTT thủ công vào `warehouse/actuators`: `{"command":"alarm_off"}`

---

### Scenario 5: Giả lập Quá Tải — Overload Detection (Anomaly)

**Mục tiêu:** Hàng vượt quá 1200g → cảnh báo quá tải.

**Thao tác trên Wokwi:**

| Bước | Hành động |
|---|---|
| 5.1 | Kéo **distance slider** HC-SR04 về `10cm`. |
| 5.2 | Chỉnh **HX711 weight** thành `1500g` (> 1200g limit). |
| 5.3 | Giữ ~2 giây. |

**Kết quả mong đợi:**

| Thành phần | Minh chứng |
|---|---|
| Serial Monitor | `[MQTT RX] Payload: {"command":"alarm_on"}` |
| Buzzer | Bíp báo động |
| AI Log | `OVERLOAD: weight 1500.0g exceeds 1200g limit` |
| Frontend Banner | **ANOMALY DETECTED** (đỏ, nhấp nháy) + reason: "OVERLOAD: weight 1500.0g exceeds 1200g limit" |
| Telegram (nếu cấu hình) | Cảnh báo quá tải |
| Email (nếu cấu hình) | Cảnh báo quá tải |

---

## 5. Luồng dữ liệu End-to-End

```
┌─────────────────────────────────────────────────────────────────────┐
│ WOKWI SIMULATOR                                                     │
│                                                                     │
│  HC-SR04 ──distance──┐                                             │
│  HX711   ──weight────┤──► ESP32 ──MQTT──► broker.hivemq.com        │
│  (dwell time calc)───┘      ▲                                       │
│                             │  warehouse/actuators                  │
│  Servo ◄── PWM ────────────┘  (gate_light/medium/heavy, alarm)     │
│  Buzzer ◄── GPIO ───────────┘                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ MQTT (warehouse/sensors)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND (Node.js)                                                   │
│                                                                     │
│  MQTT Listener ──► Firebase RTDB (persist)                         │
│       │                                                             │
│       ├── distance < 15? ──► POST /predict ──► AI Module (Python)  │
│       │                            │                                │
│       │              ◄── {category, is_anomaly, ...} ──┘           │
│       │                                                             │
│       ├── is_anomaly? ──► alarm_on (MQTT) + Telegram + Email       │
│       ├── normal ───────► gate_{category} (MQTT)                   │
│       │                                                             │
│       └── io.emit('sensor-data') + io.emit('sensor-ai-update')     │
│                    │                                                │
└────────────────────┼────────────────────────────────────────────────┘
                     │ Socket.io
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                                    │
│                                                                     │
│  Dashboard Cards:  Distance | Weight | Dwell Time | AI Class       │
│  Charts:           Distance Over Time | Weight Over Time            │
│  Anomaly Banner:   ANOMALY DETECTED (flashing red)                 │
│  Controls:         Emergency Stop | Open/Close Gate                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Troubleshooting

| Vấn đề | Nguyên nhân | Cách khắc phục |
|---|---|---|
| Wokwi không kết nối WiFi | Chưa bật IoT Gateway | Nhấn `F1` → `Wokwi: Start IoT Gateway` |
| Không thấy dữ liệu trên Dashboard | Backend chưa chạy hoặc MQTT chưa connect | Kiểm tra `docker compose ps` hoặc terminal backend |
| Servo không quay | Backend không nhận đúng command | Kiểm tra log backend có `[MQTT] Published → warehouse/actuators` |
| AI không phản hồi | AI Module chưa chạy | Khởi động `cd ai-module && python main.py` |
| Firebase không lưu dữ liệu | Thiếu `serviceAccountKey.json` | Đọc README.md hướng dẫn cấu hình Firebase |
| Telegram/Email không gửi | Chưa cấu hình `.env` | Thêm `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `EMAIL_*` vào `.env` |

---

## 7. Các MQTT Topics

| Topic | Hướng | Payload |
|---|---|---|
| `warehouse/sensors` | ESP32 → Backend | `{"deviceId":"STATION_01","distance_cm":...,"weight_g":...,"dwell_time_sec":...}` |
| `warehouse/actuators` | Backend → ESP32 | `{"command":"gate_light\|gate_medium\|gate_heavy\|gate_close\|alarm_on\|alarm_off","timestamp":"..."}` |

---

## 8. Gửi dữ liệu test bằng tay (không cần Wokwi)

Dùng MQTT client bất kỳ để giả lập sensor data:

```bash
# Giả lập hàng Light
mosquitto_pub -h broker.hivemq.com -t "warehouse/sensors" \
  -m '{"deviceId":"STATION_01","distance_cm":8.0,"weight_g":150.0,"dwell_time_sec":2.0}'

# Giả lập kẹt hàng
mosquitto_pub -h broker.hivemq.com -t "warehouse/sensors" \
  -m '{"deviceId":"STATION_01","distance_cm":8.0,"weight_g":300.0,"dwell_time_sec":8.5}'

# Giả lập quá tải
mosquitto_pub -h broker.hivemq.com -t "warehouse/sensors" \
  -m '{"deviceId":"STATION_01","distance_cm":10.0,"weight_g":1500.0,"dwell_time_sec":2.0}'
```
