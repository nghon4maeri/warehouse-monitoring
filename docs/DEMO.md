Chuẩn bị trước (trước khi demo 15 phút)
[Terminal 1] cd ai-module && python main.py
[Terminal 2] cd backend && npm run dev
[Terminal 3] cd frontend && npm run dev
[VS Code]     mở folder warehouse → F1 → Wokwi: Start Simulator
[Browser]     mở http://localhost:5173 (đã đăng nhập sẵn)
[Discord]     mở channel của bot
[Gmail]       mở hộp thư sẵn
Phần 1 — Kiến trúc hệ thống (1 phút)
"Nhóm em xây dựng hệ thống IoT hoàn chỉnh gồm 3 lớp: lớp cảm biến (ESP32 + HC-SR04 + Loadcell), lớp xử lý (Backend Node.js + AI Python), lớp hiển thị (React Dashboard + Discord + Email)."
Chỉ tay: Màn hình Wokwi (ESP32 ảo) → terminal Backend (log MQTT) → Dashboard.
Phần 2 — Luồng dữ liệu real-time (1.5 phút)
Làm: Trên Wokwi, kéo slider HC-SR04 + loadcell.
Nói:
"ESP32 đọc cảm biến mỗi 1 giây → publish MQTT tới broker → Backend nhận → lưu Firebase + đẩy real-time qua Socket.io lên Dashboard."
Minh chứng:
- Dashboard: Gauge Distance/Weight nhảy theo slider
- Backend log: [MQTT] Received... liên tục
- Firebase console: data mới xuất hiện
Phần 3 — AI phân loại hàng hóa (2 phút)
Làm 3 lần, kéo HC-SR04 xuống < 15cm, đổi loadcell từng mức:
Lần	Loadcell	Kết quả Dashboard
1	~200g	AI Classify = Light
2	~500g	AI Classify = Medium
3	~900g	AI Classify = Heavy
Nói:
"Khi vật vào vùng cảm biến (< 15cm), Backend gọi AI microservice. AI phân loại theo trọng lượng bằng rule-based + Welford online learning."
Minh chứng: BarChart Classification Distribution tăng từng cột.
Phần 4 — Phát hiện bất thường + cảnh báo (2 phút)
Làm: Kéo loadcell > 1200g (vượt tải).
Kết quả đồng thời:
1. Dashboard: Anomaly Banner đỏ nhấp nháy
2. Discord: alert embed đỏ hiện ngay
3. Gmail: email alert về máy
4. Wokwi: Buzzer kêu
Nói:
"AI phát hiện OVERLOAD → 3 kênh cảnh báo đồng thời: giao diện web, Discord thông báo nhanh về điện thoại, và email. Đây là 2 yêu cầu #6 #7 — 2 thành viên khác nhau phụ trách theo quy định."
Phần 5 — Điều khiển thiết bị từ xa (1.5 phút)
Làm trên Dashboard:
1. Bấm Open Gate → servo Wokwi quay
2. Bấm Alarm On → buzzer kêu
3. Bấm EMERGENCY STOP → cả 2 đồng thời
Nói:
"Luồng ngược: Web → Socket.io → Backend → MQTT → ESP32 → thiết bị. Toàn bộ điều khiển từ xa qua internet."
Phần 6 — Chatbot Discord (1.5 phút)
Làm trên Discord, gõ từng lệnh:
!status           → bot trả embed trạng thái cảm biến + AI
!report           → bot trả báo cáo ca làm việc
!open_gate        → servo Wokwi quay (nhìn Wokwi!)
!emergency_stop   → dừng khẩn cấp
!send_report      → email báo cáo gửi ngay (mở Gmail cho thầy xem)
Nói:
"Chatbot là yêu cầu #8 — tương tác hai chiều. Admin điều khiển và truy vấn hệ thống từ xa ngay trên điện thoại."
Phần 7 — Bảo mật + Kết thúc (1 phút)
Làm: Logout → thử login sai mật khẩu → bị chặn → login đúng.
Nói:
"Tài khoản mã hóa bcrypt lưu trong PostgreSQL, xác thực JWT. Kết thúc demo — em xin nhận câu hỏi."
Checklist nhanh trước khi bấm demo
[x] Wokwi chạy, serial có [MQTT] CONNECTED
[x] Backend log hiện [MQTT] Connected + [DiscordBot] Logged in
[x] Dashboard có data nhảy (đã login sẵn)
[x] Discord bot online
[x] Điện thoại đã cài Discord (nhận push khi alert)
[x] Gmail mở sẵn tab
[x] Firebase console mở sẵn (nếu cần minh chứng cloud)
Mẹo: Nếu giữa demo Wokwi bị treo → có sẵn python tools/mqtt_sim.py làm backup, chạy 1 lệnh là hệ thống sống lại.