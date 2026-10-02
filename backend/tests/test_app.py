"""
test_app.py — CodeForge Backend Unit Tests
Run from /backend with: python -m unittest discover -s tests -v

All tests that call /api/execute now log in a dedicated test user first,
because that endpoint requires an active Flask session.
"""
import unittest
from unittest.mock import patch
import sys
import os
import sqlite3

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from config import Config
from models.execution import ExecutionResponse
from werkzeug.security import generate_password_hash

DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "codeforge.db")

# Shared test credentials — never real, only for unit tests
_TEST_EMAIL    = "unit_test_user@codeforge.test"
_TEST_PASSWORD = "UnitTestPass123"
_TEST_NAME     = "Unit Test User"


def _ensure_test_user():
    """Create the unit-test user in the DB if it does not already exist."""
    conn = sqlite3.connect(os.path.realpath(DATABASE_PATH))
    conn.row_factory = sqlite3.Row
    existing = conn.execute("SELECT id FROM users WHERE email=?", (_TEST_EMAIL,)).fetchone()
    if not existing:
        conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?,?,?)",
            (_TEST_NAME, _TEST_EMAIL, generate_password_hash(_TEST_PASSWORD)),
        )
        conn.commit()
    conn.close()


def _delete_test_user():
    """Remove the unit-test user and their executions from the DB after the suite."""
    conn = sqlite3.connect(os.path.realpath(DATABASE_PATH))
    conn.row_factory = sqlite3.Row
    user = conn.execute("SELECT id FROM users WHERE email=?", (_TEST_EMAIL,)).fetchone()
    if user:
        conn.execute("DELETE FROM executions WHERE user_id=?", (user["id"],))
        conn.execute("DELETE FROM users WHERE id=?", (user["id"],))
        conn.commit()
    conn.close()


class FlaskAppTestCase(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        """Create the shared test user once before any test in this class runs."""
        _ensure_test_user()

    @classmethod
    def tearDownClass(cls):
        """Remove the shared test user after all tests finish."""
        _delete_test_user()

    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    # Helper: POST JSON
    def _post(self, url, payload):
        return self.client.post(url, json=payload)

    # Helper: log in the shared test user
    def _login(self):
        r = self._post("/api/auth/login", {"email": _TEST_EMAIL, "password": _TEST_PASSWORD})
        self.assertEqual(r.status_code, 200, f"Test setUp login failed: {r.get_json()}")

    # ── 1. Health check ────────────────────────────────────────────────────────
    def test_01_health_check(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "UP")

    # ── 2. Language mapping ────────────────────────────────────────────────────
    def test_02_jdoodle_language_mapping(self):
        self.assertEqual(Config.get_language_config("C")["language"],      "c")
        self.assertEqual(Config.get_language_config("C++")["language"],    "cpp17")
        self.assertEqual(Config.get_language_config("CPP")["language"],    "cpp17")
        self.assertEqual(Config.get_language_config("Java")["language"],   "java")
        self.assertEqual(Config.get_language_config("Python")["language"], "python3")

    # ── 3. /api/execute requires auth ─────────────────────────────────────────
    def test_03_execute_requires_auth(self):
        """Unauthenticated POST /api/execute must return 401."""
        response = self._post("/api/execute", {
            "language": "PYTHON",
            "sourceCode": "print('hi')",
            "stdin": ""
        })
        self.assertEqual(response.status_code, 401)
        data = response.get_json()
        self.assertFalse(data["success"])

    # ── 4. Input validation (authenticated) ───────────────────────────────────
    def test_04_empty_code_validation(self):
        self._login()
        response = self._post("/api/execute", {
            "language": "PYTHON",
            "sourceCode": "",
            "stdin": ""
        })
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["status"], "Invalid Request")
        self.assertIn("Please enter some code", data["message"])

    def test_05_unsupported_language_validation(self):
        self._login()
        response = self._post("/api/execute", {
            "language": "RUBY",
            "sourceCode": "puts 'hello'",
            "stdin": ""
        })
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["status"], "Invalid Request")
        self.assertIn("Unsupported programming language", data["message"])

    # ── 5. Mocked execution (authenticated) ───────────────────────────────────
    @patch("services.jdoodle_service.JDoodleService.execute_code")
    def test_06_successful_execution_mocked(self, mock_execute):
        mock_execute.return_value = ExecutionResponse(
            status="Accepted",
            stdout="Hello from JDoodle!\n",
            stderr="",
            compile_output="",
            message="Code executed successfully.",
            execution_time="0.03",
            memory=1468,
            exit_code=0
        )
        self._login()
        response = self._post("/api/execute", {
            "language": "PYTHON",
            "sourceCode": "print('Hello from JDoodle!')",
            "stdin": ""
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "Accepted")
        self.assertEqual(data["stdout"], "Hello from JDoodle!\n")

    @patch("services.jdoodle_service.JDoodleService.execute_code")
    def test_07_compilation_error_mocked(self, mock_execute):
        mock_execute.return_value = ExecutionResponse(
            status="Compilation Error",
            stdout="",
            stderr="",
            compile_output="main.cpp: error: expected ';' before '}' token",
            message="Code failed to compile.",
            execution_time=None,
            memory=None,
            exit_code=1
        )
        self._login()
        response = self._post("/api/execute", {
            "language": "CPP",
            "sourceCode": "#include <iostream>\nint main() { std::cout << 'hello' }",
            "stdin": ""
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "Compilation Error")
        self.assertIn("expected ';'", data["compileOutput"])

    @patch("services.jdoodle_service.JDoodleService.execute_code")
    def test_08_missing_credentials_error_mocked(self, mock_execute):
        mock_execute.return_value = ExecutionResponse.error(
            "Server Error",
            "JDoodle API credentials are not configured. Please set JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET in backend/.env file."
        )
        self._login()
        response = self._post("/api/execute", {
            "language": "JAVA",
            "sourceCode": "public class Main { public static void main(String[] args) {} }",
            "stdin": ""
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "Server Error")
        self.assertIn("JDoodle API credentials are not configured", data["message"])

    # ── 6. Auth endpoint tests ─────────────────────────────────────────────────
    def test_09_signup_duplicate_email(self):
        response = self._post("/api/auth/signup", {
            "name": "Duplicate",
            "email": _TEST_EMAIL,
            "password": "anypassword"
        })
        self.assertEqual(response.status_code, 409)
        self.assertFalse(response.get_json()["success"])

    def test_10_signup_invalid_email(self):
        response = self._post("/api/auth/signup", {
            "name": "Test",
            "email": "not-an-email",
            "password": "pass123"
        })
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])

    def test_11_signup_short_password(self):
        response = self._post("/api/auth/signup", {
            "name": "Test",
            "email": "newshort@codeforge.test",
            "password": "abc"
        })
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])

    def test_12_login_bad_credentials(self):
        response = self._post("/api/auth/login", {
            "email": _TEST_EMAIL,
            "password": "wrongpassword"
        })
        self.assertEqual(response.status_code, 401)
        self.assertFalse(response.get_json()["success"])

    def test_13_login_success_and_me(self):
        self._login()
        r = self.client.get("/api/auth/me")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data["authenticated"])
        self.assertEqual(data["user"]["email"], _TEST_EMAIL)

    def test_14_logout_clears_session(self):
        self._login()
        r = self._post("/api/auth/logout", {})
        self.assertEqual(r.status_code, 200)
        r2 = self.client.get("/api/auth/me")
        self.assertFalse(r2.get_json()["authenticated"])

    def test_15_history_requires_auth(self):
        response = self.client.get("/api/history")
        self.assertEqual(response.status_code, 401)

    def test_16_me_unauthenticated(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["authenticated"])

    # ── 7. AI chat endpoint ────────────────────────────────────────────────────
    def test_17_ai_chat_requires_auth(self):
        response = self._post("/api/ai/chat", {"question": "What is Python?"})
        self.assertEqual(response.status_code, 401)

    def test_18_ai_chat_missing_question(self):
        self._login()
        response = self._post("/api/ai/chat", {"question": ""})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])


if __name__ == "__main__":
    unittest.main()

