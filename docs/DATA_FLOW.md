# System Data Flow Diagram

```mermaid
flowchart LR
    ESP32["ESP32
    HC-SR04 + HX711
    Servo + Buzzer"]

    MQTT["MQTT Broker
    broker.hivemq.com"]

    Backend["Backend
    Express + Socket.io
    :4000"]

    AI["AI Module
    FastAPI :8000
    classify + anomaly"]

    Frontend["Frontend
    React :5173
    Gauge + Chart + History"]

    PostgreSQL["PostgreSQL
    users + logs"]

    Firebase["Firebase RTDB
    sensor time-series"]

    %% REAL-TIME: Sensor Data
    ESP32 -->|"MQTT publish
    warehouse/sensors
    distance_cm, weight_g, dwell_time_sec"| MQTT
    MQTT -->|"MQTT subscribe"| Backend
    Backend -->|"Socket.io: sensor-data (realtime)"| Frontend

    %% AI: Classify + Anomaly
    Backend -->|"POST /predict (distance < 15cm)"| AI
    AI -->|"category + anomaly + reason"| Backend
    Backend -->|"Socket.io: sensor-ai-update"| Frontend

    %% PERSIST: Save + History
    Backend -->|"saveSensorReading() (mỗi 3s)"| Firebase
    Frontend -->|"GET /api/history (mỗi 10s)"| Backend
    Backend -->|"getHistory() → last 100 records"| Firebase
    Backend -->|"JSON history data"| Frontend

    %% ACTUATOR
    Backend -->|"MQTT publish gate/alarm"| MQTT
    MQTT -->|"MQTT subscribe"| ESP32

    %% AUTH
    Frontend -->|"POST /api/auth login/register"| Backend
    Backend -->|"query users"| PostgreSQL

    %% Styles
    classDef blue fill:#164e63,stroke:#22d3ee,color:#fff
    classDef green fill:#14532d,stroke:#34d399,color:#fff
    classDef orange fill:#78350f,stroke:#f59e0b,color:#fff
    classDef purple fill:#3b0764,stroke:#a78bfa,color:#fff
    classDef gray fill:#1e293b,stroke:#94a3b8,color:#fff

    class ESP32,MQTT blue
    class AI green
    class Backend orange
    class Frontend purple
    class PostgreSQL,Firebase gray
```

## 3 Data Flows

| # | Flow | Đường đi | Mục đích |
|---|---|---|---|
| 1 | **Real-time** | ESP32 → MQTT → Backend → Socket.io → Frontend | Gauge + Chart update ngay |
| 2 | **AI** | Backend → AI /predict → Backend → Frontend | Phân loại + phát hiện bất thường |
| 3 | **History** | Firebase ← Backend (save) / Firebase → Backend → Frontend (fetch) | Lưu trữ + hiển thị lịch sử |
