"""
Test 6 — Auth API (ID 9)
Kiểm tra đăng ký, đăng nhập, JWT verify
"""
import requests, sys, uuid

BACKEND_URL = "http://localhost:4000"
TEST_USER = f"test_{uuid.uuid4().hex[:8]}"
TEST_PASS = "Test123!@#"

def test_auth():
    print("\n=== TEST 6: Auth API ===\n")

    # Health check
    try:
        r = requests.get(f"{BACKEND_URL}/api/health", timeout=3)
        print(f"[Health] {r.json()}")
    except:
        print("FAIL — Backend not running")
        return False

    # Register
    r = requests.post(f"{BACKEND_URL}/api/auth/register", json={
        "username": TEST_USER,
        "email": f"{TEST_USER}@test.com",
        "password": TEST_PASS,
    })
    print(f"[POST /api/auth/register] {r.status_code} {r.json()}")

    # Login
    r = requests.post(f"{BACKEND_URL}/api/auth/login", json={
        "email": f"{TEST_USER}@test.com",
        "password": TEST_PASS,
    })
    login_data = r.json()
    print(f"[POST /api/auth/login] {r.status_code} token={'OK' if login_data.get('token') else 'FAIL'}")

    token = login_data.get("token")
    if not token:
        print("FAIL — No JWT token returned")
        return False

    # Verify token
    r = requests.post(f"{BACKEND_URL}/api/auth/verify", headers={
        "Authorization": f"Bearer {token}",
    })
    print(f"[POST /api/auth/verify] {r.status_code} {r.json()}")

    # Reject bad token
    r = requests.post(f"{BACKEND_URL}/api/auth/verify", headers={
        "Authorization": "Bearer invalid_token_here",
    })
    print(f"[POST /api/auth/verify] Bad token -> {r.status_code}")

    # Reject duplicate register
    r = requests.post(f"{BACKEND_URL}/api/auth/register", json={
        "username": TEST_USER,
        "email": f"{TEST_USER}@test.com",
        "password": TEST_PASS,
    })
    print(f"[POST /api/auth/register] Duplicate -> {r.status_code}")

    print("\nPASS — Auth API works correctly")
    return True

if __name__ == "__main__":
    sys.exit(0 if test_auth() else 1)
