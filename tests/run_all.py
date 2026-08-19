"""
Run All Tests — Warehouse Monitoring System
============================================
python tests/run_all.py
"""
import subprocess, sys, os

def main():
    print("=" * 50)
    print("  Warehouse Monitoring - Test Suite")
    print("=" * 50)

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    tests = [
        ("Auth API",        "test_auth.py"),
        ("AI Module",       "test_ai_module.py"),
        ("MQTT Pipeline",   "test_mqtt_pipeline.py"),
        ("Discord Alert",   "test_discord_alert.py"),
        ("Email Report",    "test_email_report.py"),
        ("Discord Bot",     "test_discord_bot.py"),
    ]

    passed, failed, skipped = 0, 0, 0

    for name, script in tests:
        print(f"\n--- {name} ---")
        result = subprocess.run([sys.executable, script], capture_output=True, text=True)
        print(result.stdout)
        if result.returncode == 0:
            passed += 1
        else:
            failed += 1

    print(f"\n{'=' * 50}")
    print(f"  {passed} passed, {failed} failed, {skipped} skipped")
    print(f"{'=' * 50}")
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
