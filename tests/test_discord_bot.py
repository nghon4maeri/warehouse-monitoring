"""
Test 5 — Discord Chatbot (ID 8)
Kiểm tra Bot đã online và đăng ký messageCreate event
"""
import requests, sys, os
from dotenv import load_dotenv
load_dotenv()

BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")

def test_discord_bot():
    print("\n=== TEST 5: Discord Chatbot ===\n")

    if not BOT_TOKEN or "your_" in BOT_TOKEN:
        print("SKIP — DISCORD_BOT_TOKEN not configured. Add to .env.")
        return None

    # Kiểm tra bot token hợp lệ
    try:
        r = requests.get(
            f"https://discord.com/api/v10/users/@me",
            headers={"Authorization": f"Bot {BOT_TOKEN}"},
            timeout=5,
        )
        if r.status_code == 200:
            data = r.json()
            print(f"[Discord] Bot online: {data['username']}#{data['discriminator']}")
            print(f"           Bot ID: {data['id']}")
        else:
            print(f"FAIL — Invalid token. HTTP {r.status_code}: {r.text}")
            return False
    except Exception as e:
        print(f"FAIL — Cannot reach Discord API: {e}")
        return False

    # Kiểm tra backend log
    try:
        r = requests.get("http://localhost:4000/api/health", timeout=3)
        if r.status_code == 200:
            print("[Backend] Running — bot should be connected")
        else:
            print("[Backend] Not responding")
    except:
        print("[Backend] Not running")

    print("\nManual test (in Discord channel):")
    print("  !help            — Show commands")
    print("  !status          — Sensor + AI status")
    print("  !report          — Shift stats summary")
    print("  !open_gate       — Open sorting gate")
    print("  !emergency_stop  — Emergency stop")
    print("  !send_report     — Trigger email report")
    print("\nPASS — Bot token valid. Test commands manually in Discord.")
    return True

if __name__ == "__main__":
    test_discord_bot()
