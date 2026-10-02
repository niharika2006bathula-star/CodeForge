"""
test_session.py — End-to-end session and history isolation test.
Run from /backend with: python test_session.py
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from werkzeug.security import generate_password_hash
import sqlite3

DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'codeforge.db')

# ── Helpers ───────────────────────────────────────────────────────────────────
def jpost(client, url, payload):
    return client.post(url, data=json.dumps(payload), content_type='application/json')

def pretty(label, data):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    if isinstance(data, dict):
        for k, v in data.items():
            print(f"  {k}: {v}")
    else:
        print(f"  {data}")

# ── Ensure test users exist with known passwords ──────────────────────────────
def ensure_test_users():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    # Create test accounts if they don't exist
    users = [
        ('Test Account A', 'testa@codeforge.test', 'passwordA'),
        ('Test Account B', 'testb@codeforge.test', 'passwordB'),
    ]
    for name, email, pwd in users:
        existing = conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()
        if not existing:
            conn.execute(
                'INSERT INTO users (name, email, password_hash) VALUES (?,?,?)',
                (name, email, generate_password_hash(pwd))
            )
            conn.commit()
            print(f"Created test user: {email}")
        else:
            print(f"Test user already exists: {email}")
    conn.close()

# ── Main test ─────────────────────────────────────────────────────────────────
def run_tests():
    app = create_app()
    client = app.test_client()
    app.config['TESTING'] = True

    ensure_test_users()

    # ── Test 1: User A logs in and gets history ────────────────────────────
    pretty("TEST 1: User A login", {})
    r = jpost(client, '/api/auth/login', {'email': 'testa@codeforge.test', 'password': 'passwordA'})
    assert r.status_code == 200, f"Login failed: {r.get_json()}"
    user_a_data = r.get_json()
    print(f"  Logged in as: {user_a_data['user']['name']} (id={user_a_data['user']['id']})")

    # ── Test 2: /api/auth/me shows User A ─────────────────────────────────
    r = client.get('/api/auth/me')
    me = r.get_json()
    assert me['authenticated'], "Should be authenticated as User A"
    assert me['user']['email'] == 'testa@codeforge.test'
    print(f"  /api/auth/me confirms: {me['user']['name']}")

    # ── Test 3: History returns User A's records only ──────────────────────
    r = client.get('/api/history')
    assert r.status_code == 200, f"History failed: {r.get_json()}"
    hist_a = r.get_json()
    count_a_before = len(hist_a['records'])
    print(f"  User A history count (before): {count_a_before}")

    # ── Test 4: Logout ─────────────────────────────────────────────────────
    r = jpost(client, '/api/auth/logout', {})
    assert r.status_code == 200
    print("\n  User A logged out.")

    # ── Test 5: History is blocked after logout ────────────────────────────
    r = client.get('/api/history')
    assert r.status_code == 401, f"Expected 401 after logout, got {r.status_code}"
    print("  /api/history after logout -> 401 (correct)")

    # ── Test 6: User B logs in ─────────────────────────────────────────────
    pretty("TEST 2: User B login", {})
    r = jpost(client, '/api/auth/login', {'email': 'testb@codeforge.test', 'password': 'passwordB'})
    assert r.status_code == 200, f"Login failed: {r.get_json()}"
    user_b_data = r.get_json()
    print(f"  Logged in as: {user_b_data['user']['name']} (id={user_b_data['user']['id']})")

    # ── Test 7: User B history is separate from User A ────────────────────
    r = client.get('/api/history')
    assert r.status_code == 200
    hist_b = r.get_json()
    count_b = len(hist_b['records'])
    print(f"  User B history count: {count_b}")

    # Verify no cross-contamination (User B should have <= records than User A sees)
    # (we can't be 100% sure without mock execution, but IDs should match)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    uid_b = user_b_data['user']['id']
    uid_a = user_a_data['user']['id']
    rows_b = conn.execute('SELECT id FROM executions WHERE user_id=?', (uid_b,)).fetchall()
    rows_a = conn.execute('SELECT id FROM executions WHERE user_id=?', (uid_a,)).fetchall()
    conn.close()

    assert count_b == len(rows_b), f"API returned {count_b} but DB has {len(rows_b)} for User B"
    print(f"  DB confirms User B has {len(rows_b)} executions")
    print(f"  DB confirms User A has {len(rows_a)} executions")

    # ── Test 8: User B cannot see User A's records ─────────────────────────
    b_ids = {r['id'] for r in hist_b['records']}
    a_db_ids = {r['id'] for r in rows_a}
    overlap = b_ids & a_db_ids
    assert len(overlap) == 0, f"ISOLATION FAILURE: User B can see User A records: {overlap}"
    print("  Isolation check PASSED: User B sees 0 of User A's records")

    # ── Test 9: Logout User B, Login User A again ──────────────────────────
    pretty("TEST 3: User A re-login (history persists)", {})
    jpost(client, '/api/auth/logout', {})
    r = jpost(client, '/api/auth/login', {'email': 'testa@codeforge.test', 'password': 'passwordA'})
    assert r.status_code == 200
    r = client.get('/api/history')
    hist_a_again = r.get_json()
    count_a_again = len(hist_a_again['records'])
    assert count_a_again == count_a_before, \
        f"User A history changed after re-login: {count_a_before} -> {count_a_again}"
    print(f"  User A history still shows {count_a_again} records - persistence PASSED")

    # ── Test 10: DELETE history clears only User A's records ──────────────
    pretty("TEST 4: Clear History isolation", {})
    # First ensure User A has at least one record to delete
    # (We just read existing records, count_a_again might be 0)
    print(f"  User A records before clear: {count_a_again}")
    r = client.delete('/api/history')
    assert r.status_code == 200
    r = client.get('/api/history')
    hist_a_after_clear = r.get_json()
    count_a_cleared = len(hist_a_after_clear['records'])
    assert count_a_cleared == 0, f"Clear history failed: still {count_a_cleared} records"
    print(f"  User A records after clear: {count_a_cleared} - clear PASSED")

    # Verify User B's records are untouched
    jpost(client, '/api/auth/logout', {})
    r = jpost(client, '/api/auth/login', {'email': 'testb@codeforge.test', 'password': 'passwordB'})
    assert r.status_code == 200
    r = client.get('/api/history')
    hist_b_after = r.get_json()
    count_b_after = len(hist_b_after['records'])
    assert count_b_after == count_b, \
        f"User B history changed after clearing User A: {count_b} -> {count_b_after}"
    print(f"  User B history unchanged: still {count_b_after} records - isolation PASSED")

    print("\n" + "="*60)
    print("  ALL TESTS PASSED - OK")
    print("="*60)

if __name__ == '__main__':
    run_tests()
