# Hướng dẫn Cài đặt & Chạy Dự án

**Dành cho:** Các thành viên nhóm (Nam, Khang, Tony)  
**Dự án:** Hệ thống Trạm phân loại hàng hóa và Giám sát kho thông minh

---

## Mục lục

1. [Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
2. [Clone & cài đặt](#2-clone--cài-đặt)
3. [Cấu hình PostgreSQL](#3-cấu-hình-postgresql)
4. [Cấu hình Firebase](#4-cấu-hình-firebase)
5. [Cấu hình Telegram Bot](#5-cấu-hình-telegram-bot)
6. [Cấu hình Email (Gmail)](#6-cấu-hình-email-gmail)
7. [File .env hoàn chỉnh](#7-file-env-hoàn-chỉnh)
8. [Khởi động toàn bộ hệ thống](#8-khởi-động-toàn-bộ-hệ-thống)
9. [Kiểm tra hoạt động](#9-kiểm-tra-hoạt-động)
10. [Chạy Wokwi Simulator](#10-chạy-wokwi-simulator)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Yêu cầu hệ thống

| Công cụ | Phiên bản tối thiểu | Kiểm tra |
|---|---|---|
| Node.js | 20+ | `node -v` |
| Python | 3.10+ | `python --version` |
| PostgreSQL | 16 | Service đang chạy |
| Git | 2.x+ | `git --version` |
| VS Code | Latest | |
| Wokwi for VS Code | Latest | Extension marketplace |
| Docker Desktop | 4.x+ | (tùy chọn, nếu dùng Docker) |

---

## 2. Clone & cài đặt

```bash
# Clone repository
git clone <your-repo-url> warehouse-monitoring
cd warehouse-monitoring

# Cài đặt toàn bộ dependencies
npm run install:all
```

Lệnh trên sẽ tự động:
- `cd backend && npm install`
- `cd frontend && npm install`
- `cd ai-module && pip install -r requirements.txt`

---

## 3. Cấu hình PostgreSQL

### Bước 1: Kiểm tra PostgreSQL đã chạy chưa

```powershell
Get-Service -Name "postgresql*"
# Phải hiển thị: Running
```

Nếu chưa chạy:
```powershell
Start-Service -Name "postgresql-x64-16"
```

### Bước 2: Tạo database và user (chỉ chạy 1 lần)

```powershell
# Mở psql với quyền superuser
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost

# Trong psql, chạy từng lệnh:
CREATE USER warehouse_admin WITH PASSWORD 'change_me_in_production';
CREATE DATABASE warehouse_db OWNER warehouse_admin;
\c warehouse_db
GRANT ALL ON SCHEMA public TO warehouse_admin;
\q
```

### Bước 3: Chạy migration tạo bảng

```powershell
Get-Content .\backend\migrations\001_initial.sql | `
  & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -d warehouse_db
```

Kết quả mong đợi:
```
CREATE EXTENSION
CREATE EXTENSION
CREATE TABLE
CREATE TABLE
CREATE INDEX
CREATE INDEX
INSERT 0 1
```

### Bước 4: Kiểm tra kết nối

```bash
cd backend
node -e "const {pool} = require('./config/database'); pool.query('SELECT current_user').then(r => { console.log('OK:', r.rows[0]); pool.end() })"
# Phải hiển thị: OK: { current_user: 'warehouse_admin' }
```

---

## 4. Cấu hình Firebase

### Bước 1: Tạo Firebase project

1. Vào https://console.firebase.google.com
2. Click **Add project** (hoặc chọn project có sẵn)
3. Đặt tên project (ví dụ: `warehouse-monitoring`)
4. Chọn **Realtime Database** → **Create Database**
5. Chọn vị trí server (khuyến nghị: Singapore `asia-southeast1`)

### Bước 2: Tạo Service Account Key

1. Firebase Console → biểu tượng bánh răng ⚙️ → **Project settings**
2. Tab **Service accounts**
3. Click **Generate new private key** → **Generate key**
4. File JSON sẽ tự động tải về

### Bước 3: Đặt key vào project

```bash
# Đổi tên file JSON vừa tải về
# Đặt vào thư mục backend/config/
# File cuối cùng phải là: backend/config/serviceAccountKey.json
```

### Bước 4: Lấy Database URL

1. Firebase Console → **Realtime Database** → tab **Data**
2. Copy URL có dạng: `https://<project-id>-default-rtdb.firebaseio.com/`

### Bước 5: Điền vào .env

```
FIREBASE_SERVICE_ACCOUNT_PATH=./config/serviceAccountKey.json
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
```

### Kiểm tra

```bash
cd backend
node -e "const fb = require('./config/firebase'); console.log(fb.db ? 'Firebase OK' : 'FAIL')"
# Phải hiển thị: Firebase OK
```

---

## 5. Cấu hình Telegram Bot

### Bước 1: Tạo bot

1. Mở Telegram (desktop hoặc mobile)
2. Tìm và chat với **@BotFather** (có dấu tick xanh ✅)
3. Gửi lệnh: `/newbot`
4. Đặt tên hiển thị: `Warehouse Alert Bot`
5. Đặt username: `warehouse_alert_xxxx_bot` (phải kết thúc bằng `bot`)
6. **Copy TOKEN** mà BotFather trả về
   ```
   Ví dụ: 7123456789:AAHgKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOp
   ```

### Bước 2: Lấy Chat ID

1. Tìm bot vừa tạo trên Telegram (search theo username)
2. Nhấn **START** (hoặc gửi tin nhắn `/start`)
3. Gửi 1 tin nhắn bất kỳ cho bot
4. Mở trình duyệt, truy cập URL (thay `<TOKEN>` bằng token thật):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
5. Tìm trong JSON trả về:
   ```json
   "chat": {"id": 123456789, ...}
   ```
6. Copy số `123456789` → đây là `TELEGRAM_CHAT_ID`

### Bước 3: Điền vào .env

```
TELEGRAM_BOT_TOKEN=7123456789:AAHgKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOp
TELEGRAM_CHAT_ID=123456789
```

---

## 6. Cấu hình Email (Gmail)

### Bước 1: Bật xác minh 2 bước

1. Vào https://myaccount.google.com/security
2. Mục **"How you sign in to Google"** → bật **2-Step Verification**
3. Làm theo hướng dẫn (nhập số điện thoại, nhập mã xác nhận)

### Bước 2: Tạo App Password

1. Vào https://myaccount.google.com/apppasswords
2. Nhập tên app bất kỳ: `Warehouse Monitoring`
3. Click **Create**
4. **Copy mật khẩu 16 ký tự** (không có khoảng trắng)
   ```
   Ví dụ: abcd efgh ijkl mnop
   → Điền vào là: abcdefghijklmnop
   ```

### Bước 3: Điền vào .env

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=abcdefghijklmnop
EMAIL_TO=recipient@example.com
```

---

## 7. File .env hoàn chỉnh

Sau khi làm hết các bước trên, file `.env` của bạn sẽ có dạng:

```env
# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=warehouse_db
PG_USER=warehouse_admin
PG_PASSWORD=change_me_in_production

# Firebase
FIREBASE_SERVICE_ACCOUNT_PATH=./config/serviceAccountKey.json
FIREBASE_DATABASE_URL=https://warehouse-monitoring-xxxxx-default-rtdb.firebaseio.com/

# MQTT
MQTT_BROKER_URL=mqtt://broker.hivemq.com
MQTT_USERNAME=
MQTT_PASSWORD=

# JWT
JWT_SECRET=4b88e9cf7b0c3617884cd48fe498333ad21ed3776592fc9dc496230a58f82acd

# Server
PORT=4000
CORS_ORIGIN=http://localhost:5173

# AI
AI_SERVICE_URL=http://localhost:8000

# Telegram
TELEGRAM_BOT_TOKEN=7123456789:AAHgKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOp
TELEGRAM_CHAT_ID=123456789

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=abcdefghijklmnop
EMAIL_TO=recipient@example.com
```

> ⚠️ **Quan trọng:** Chỉ cần điền PostgreSQL + Firebase + MQTT + JWT là backend chạy được.  
> Telegram + Email là tùy chọn — nếu để trống backend vẫn chạy, chỉ bỏ qua gửi cảnh báo.

---

## 8. Khởi động toàn bộ hệ thống

Cần mở **4 terminal** riêng biệt:

### Terminal 1 — AI Module (Python)
```bash
cd ai-module
python main.py
# → Uvicorn running on http://0.0.0.0:8000
```

### Terminal 2 — Backend (Node.js)
```bash
cd backend
npm run dev
# → [Server] Warehouse backend listening on http://localhost:4000
# → [PG] Connected — server time: ...
# → [Firebase] Admin SDK initialised
# → [MQTT] Connected to broker
# → [MQTT] Subscribed to warehouse/sensors
```

### Terminal 3 — Frontend (React + Vite)
```bash
cd frontend
npm run dev
# → Vite dev server running at http://localhost:5173
```

### Terminal 4 — Wokwi Simulator (VS Code)
1. Mở thư mục `firmware/` trong VS Code
2. Nhấn `F1` → **Wokwi: Start IoT Gateway**
3. Nhấn `F1` → **Wokwi: Start Simulation**

---

## 9. Kiểm tra hoạt động

### 9.1 Health check
```bash
curl http://localhost:4000/api/health
# → {"status":"ok","uptime":...}

curl http://localhost:8000/
# → {"service":"warehouse-ai","status":"ok","version":"2.0.0"}
```

### 9.2 Đăng ký tài khoản
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@warehouse.local","password":"test123"}'
```

### 9.3 Mở Dashboard
Trình duyệt → http://localhost:5173  
Đăng nhập: `admin@warehouse.local` / `admin123`

### 9.4 Test dữ liệu giả (không cần Wokwi)
```bash
# Gửi dữ liệu sensor giả lập
mosquitto_pub -h broker.hivemq.com -t "warehouse/sensors" `
  -m '{"deviceId":"STATION_01","distance_cm":8.0,"weight_g":150.0,"dwell_time_sec":2.0}'
```
Dashboard sẽ hiển thị ngay dữ liệu mới.

---

## 10. Chạy Wokwi Simulator

Xem chi tiết tại: [`docs/WOKWI_TESTING_GUIDE.md`](./WOKWI_TESTING_GUIDE.md)

Tóm tắt nhanh:
1. VS Code → mở folder `firmware/`
2. `F1` → **Wokwi: Start IoT Gateway**
3. `F1` → **Wokwi: Start Simulation**
4. Serial Monitor sẽ hiện log kết nối WiFi + MQTT

---

## 11. Troubleshooting

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `password authentication failed for user "warehouse_admin"` | PostgreSQL user chưa được tạo hoặc sai password | Làm lại Bước 2 của mục 3 |
| `Cannot find module './config/serviceAccountKey.json'` | Firebase key chưa có hoặc sai đường dẫn | Làm lại mục 4 |
| `[Firebase] Failed to initialise Admin SDK` | File key không hợp lệ hoặc sai URL | Kiểm tra file JSON + FIREBASE_DATABASE_URL |
| `EADDRINUSE: address already in use :::4000` | Port 4000 đã có process khác dùng | Tắt process cũ: `npx kill-port 4000` |
| `Module not found: lucide-react` | Frontend chưa cài dependencies | `cd frontend && npm install` |
| Wokwi không kết nối WiFi | Chưa bật IoT Gateway | `F1` → **Wokwi: Start IoT Gateway** |
| Frontend không hiển thị dữ liệu | Backend chưa chạy hoặc MQTT chưa connect | Kiểm tra Terminal 2 có log `[MQTT] Subscribed` |
| AI không phản hồi | AI Module chưa chạy | `cd ai-module && python main.py` |
| `Python not found` | Python chưa cài hoặc chưa thêm vào PATH | Cài Python 3.10+ từ python.org, chọn "Add to PATH" |
| `pip not found` | pip chưa cài | `python -m ensurepip --upgrade` |

---

## Phân công kiểm tra

| Thành viên | Kiểm tra |
|---|---|
| **Nam** | Firebase kết nối OK, sensor data lưu được, Dashboard hiển thị real-time |
| **Khang** | AI Module `/predict` response đúng format, PostgreSQL schema đúng |
| **Tony** | MQTT broker kết nối OK, Telegram/Email alert gửi được, actuator command hoạt động |
| **Cả team** | Toàn bộ 5 scenario trong `WOKWI_TESTING_GUIDE.md` pass |
