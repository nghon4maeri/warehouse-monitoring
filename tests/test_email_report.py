"""
Test 4 — Email Scheduled Report (ID 7)
Gọi API /api/report/send để trigger gửi email báo cáo ngay
"""
import requests, sys, os
from dotenv import load_dotenv
load_dotenv()

BACKEND_URL = "http://localhost:4000"

def test_email_report():
    print("\n=== TEST 4: Email Scheduled Report ===\n")

    email_user = os.getenv("EMAIL_USER", "")
    if not email_user or "your_email" in email_user:
        print("SKIP — Email not configured. Add to .env:")
        print("  EMAIL_USER=your_email@gmail.com")
        print("  EMAIL_PASS=your_app_password")
        return None

    # Gọi API send report
    try:
        r = requests.post(f"{BACKEND_URL}/api/report/send", timeout=10)
        result = r.json()
        print(f"[POST /api/report/send] {result}")
    except requests.ConnectionError:
        print("FAIL — Backend not running (cd backend && npm run dev)")
        return False
    except Exception as e:
        print(f"FAIL — API error: {e}")
        return False

    if result.get("success"):
        print(f"\nPASS — Email report sent to {email_user}")
        print("Check inbox for: [Warehouse Report] Shift Summary")
        return True
    else:
        print(f"\nFAIL — {result.get('error', 'Unknown error')}")
        print("Check backend terminal for: [ShiftReport] Email not configured")
        return False

if __name__ == "__main__":
    sys.exit(0 if test_email_report() else 1)
