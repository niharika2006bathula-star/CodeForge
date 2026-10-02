import sys
import os
import re
import sqlite3

# Ensure backend folder is on sys.path for direct python app.py execution
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

from config import Config
from database import init_db, get_db_connection
from models.execution import ExecutionRequest, ExecutionResponse
from services.jdoodle_service import JDoodleService
from services.ai_service import chat as ai_chat


# ── Simple email format validator ─────────────────────────────────────────────
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

def _valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email.strip()))


def create_app() -> Flask:
    """Application factory for the CodeForge Flask REST API."""
    app = Flask(__name__)

    # ── Session & Security Configuration ─────────────────────────────
    app.secret_key                        = Config.SECRET_KEY
    app.config["SESSION_COOKIE_HTTPONLY"] = Config.SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"] = Config.SESSION_COOKIE_SAMESITE
    app.config["SESSION_COOKIE_SECURE"]   = Config.SESSION_COOKIE_SECURE

    # ── CORS ─────────────────────────────────────────────────────────
    # supports_credentials=True is required so Flask session cookies are
    # sent cross-origin. Origins must be explicit when credentials are used.
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5500",
                "http://127.0.0.1:5500",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5000",
                "null"   # local file:// support
            ],
            "methods": ["GET", "POST", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
        }
    })

    # ── Database Initialisation ───────────────────────────────────────
    # Idempotent: creates users + executions tables if missing.
    # Existing data is never deleted.
    init_db()

    # ══════════════════════════════════════════════════════════════════
    # HELPER: resolve display status from JDoodle raw status string
    # ══════════════════════════════════════════════════════════════════
    def _resolve_status(status_str: str) -> str:
        s = (status_str or "").lower()
        if   "accept"  in s or "complete" in s: return "Accepted"
        elif "compile" in s or "compilation" in s: return "Compilation Error"
        elif "time limit" in s or "tle" in s:   return "Time Limit Exceeded"
        elif "runtime" in s:                     return "Runtime Error"
        elif "server error" in s:                return "Server Error"
        return status_str

    # ══════════════════════════════════════════════════════════════════
    # EXECUTE — modified to save result to SQLite per authenticated user
    # ══════════════════════════════════════════════════════════════════

    @app.route("/api/execute", methods=["POST"])
    def execute_code():
        """
        POST /api/execute
        Requires an active Flask session (authenticated user).
        Sends code to JDoodle, saves the execution result in SQLite
        under the current user's user_id, then returns the result.

        user_id is ALWAYS taken from session — never from the request body.

        Returns 401 if the user is not logged in.
        """
        # ── Auth check ────────────────────────────────────────────────
        if "user_id" not in session:
            return jsonify({"success": False, "message": "Authentication required"}), 401

        user_id = session["user_id"]

        if not request.is_json:
            return jsonify(
                ExecutionResponse.error("Invalid Request", "Request content-type must be application/json.").to_dict()
            ), 400

        try:
            data     = request.get_json()
            exec_req = ExecutionRequest.from_dict(data)

            is_valid, err_msg = exec_req.validate()
            if not is_valid:
                return jsonify(ExecutionResponse.error("Invalid Request", err_msg).to_dict()), 400

            # ── Execute via JDoodle (unchanged path) ─────────────────
            exec_res = JDoodleService.execute_code(exec_req)

            # ── Persist to SQLite ────────────────────────────────────
            # Store a first-line snippet of source_code as a program name
            # (truncated for display). Full source is stored for future use.
            display_status = _resolve_status(exec_res.status)
            exec_time_str  = (
                f"{float(exec_res.execution_time):.3f}s"
                if exec_res.execution_time is not None else ""
            )

            conn = get_db_connection()
            try:
                conn.execute(
                    """INSERT INTO executions
                         (user_id, language, source_code, stdin,
                          stdout, stderr, compile_output,
                          status, execution_time, memory)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        user_id,
                        exec_req.language,
                        exec_req.source_code,
                        exec_req.stdin,
                        exec_res.stdout or "",
                        exec_res.stderr or "",
                        exec_res.compile_output or "",
                        display_status,
                        exec_time_str,
                        str(exec_res.memory) if exec_res.memory is not None else "",
                    )
                )
                conn.commit()
            except Exception:
                # Never let a DB write failure break the compiler response
                pass
            finally:
                conn.close()

            status_code = 400 if exec_res.status == "Invalid Request" else 200
            return jsonify(exec_res.to_dict()), status_code

        except ValueError as ve:
            return jsonify(ExecutionResponse.error("Invalid Request", str(ve)).to_dict()), 400
        except Exception as e:
            return jsonify(
                ExecutionResponse.error("Server Error", f"Server encountered an error: {str(e)}").to_dict()
            ), 500

    # ══════════════════════════════════════════════════════════════════
    # HISTORY — user-specific execution history
    # ══════════════════════════════════════════════════════════════════

    @app.route("/api/history", methods=["GET"])
    def get_history():
        """
        GET /api/history
        Returns the execution history for the currently logged-in user only.
        user_id is taken exclusively from the Flask session.
        Records are ordered newest first.
        Returns 401 if not authenticated.
        """
        if "user_id" not in session:
            return jsonify({"success": False, "message": "Authentication required"}), 401

        user_id = session["user_id"]

        conn = get_db_connection()
        try:
            rows = conn.execute(
                """SELECT id, language, source_code, stdout, stderr,
                          compile_output, status, execution_time, memory, created_at
                   FROM   executions
                   WHERE  user_id = ?
                   ORDER  BY created_at DESC""",
                (user_id,)
            ).fetchall()
        finally:
            conn.close()

        records = []
        for row in rows:
            # Derive a brief "program name" from the first line of source code
            src        = row["source_code"] or ""
            first_line = src.strip().split("\n")[0]
            prog_name  = (first_line[:47] + "...") if len(first_line) > 50 else first_line or "(untitled)"

            records.append({
                "id":            row["id"],
                "language":      row["language"],
                "programName":   prog_name,
                "status":        row["status"],
                "executionTime": row["execution_time"],
                "memory":        row["memory"],
                "timestamp":     row["created_at"],
            })

        return jsonify({
            "success": True,
            "records": records,
            "total":   len(records)
        }), 200

    @app.route("/api/history", methods=["DELETE"])
    def delete_history():
        """
        DELETE /api/history
        Deletes ALL execution history for the currently logged-in user.
        user_id is taken exclusively from the Flask session — the frontend
        cannot target another user's records.
        Returns 401 if not authenticated.
        """
        if "user_id" not in session:
            return jsonify({"success": False, "message": "Authentication required"}), 401

        user_id = session["user_id"]

        conn = get_db_connection()
        try:
            conn.execute(
                "DELETE FROM executions WHERE user_id = ?",
                (user_id,)
            )
            conn.commit()
        finally:
            conn.close()

        return jsonify({
            "success": True,
            "message": "History cleared"
        }), 200

    # ══════════════════════════════════════════════════════════════════
    # HEALTH CHECK
    # ══════════════════════════════════════════════════════════════════

    @app.route("/health", methods=["GET"])
    def health_check():
        """Health check endpoint for backend monitoring."""
        return jsonify({"status": "UP", "service": "Online Compiler Python Flask Backend"}), 200

    # ══════════════════════════════════════════════════════════════════
    # AUTHENTICATION ENDPOINTS — unchanged
    # ══════════════════════════════════════════════════════════════════

    @app.route("/api/auth/signup", methods=["POST"])
    def signup():
        """
        POST /api/auth/signup
        Body: { "name": "...", "email": "...", "password": "..." }
        Hashes password with Werkzeug and stores in users table.
        Returns 409 if email already exists.
        """
        if not request.is_json:
            return jsonify({"success": False, "message": "Request must be JSON."}), 400

        data     = request.get_json()
        name     = (data.get("name")     or "").strip()
        email    = (data.get("email")    or "").strip().lower()
        password = (data.get("password") or "")

        if not name:
            return jsonify({"success": False, "message": "Full name is required."}), 400
        if not email:
            return jsonify({"success": False, "message": "Email is required."}), 400
        if not _valid_email(email):
            return jsonify({"success": False, "message": "Please enter a valid email address."}), 400
        if not password:
            return jsonify({"success": False, "message": "Password is required."}), 400
        if len(password) < 6:
            return jsonify({"success": False, "message": "Password must be at least 6 characters."}), 400

        password_hash = generate_password_hash(password)

        conn = get_db_connection()
        try:
            conn.execute(
                "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                (name, email, password_hash)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            return jsonify({
                "success": False,
                "message": "An account with this email already exists."
            }), 409
        except Exception:
            return jsonify({"success": False, "message": "Server error during registration."}), 500
        finally:
            conn.close()

        return jsonify({"success": True, "message": "Account created successfully"}), 201

    @app.route("/api/auth/login", methods=["POST"])
    def login():
        """
        POST /api/auth/login
        Body: { "email": "...", "password": "..." }
        Verifies credentials and creates a Flask session.
        """
        if not request.is_json:
            return jsonify({"success": False, "message": "Request must be JSON."}), 400

        data     = request.get_json()
        email    = (data.get("email")    or "").strip().lower()
        password = (data.get("password") or "")

        if not email or not password:
            return jsonify({"success": False, "message": "Email and password are required."}), 400

        conn = get_db_connection()
        try:
            user = conn.execute(
                "SELECT id, name, email, password_hash FROM users WHERE email = ?",
                (email,)
            ).fetchone()
        finally:
            conn.close()

        if user is None or not check_password_hash(user["password_hash"], password):
            return jsonify({"success": False, "message": "Invalid email or password."}), 401

        session.clear()
        session["user_id"] = user["id"]
        session["name"]    = user["name"]
        session["email"]   = user["email"]

        return jsonify({
            "success": True,
            "message": "Login successful",
            "user": {
                "id":    user["id"],
                "name":  user["name"],
                "email": user["email"]
            }
        }), 200

    @app.route("/api/auth/me", methods=["GET"])
    def me():
        """GET /api/auth/me — Returns session user or { authenticated: false }."""
        if "user_id" not in session:
            return jsonify({"authenticated": False}), 200
        return jsonify({
            "authenticated": True,
            "user": {
                "id":    session["user_id"],
                "name":  session["name"],
                "email": session["email"]
            }
        }), 200

    @app.route("/api/auth/logout", methods=["POST"])
    def logout():
        """POST /api/auth/logout — Clears the Flask session."""
        session.clear()
        return jsonify({"success": True, "message": "Logged out successfully"}), 200

    # ══════════════════════════════════════════════════════════════════
    # AI ASSISTANT — POST /api/ai/chat
    # ══════════════════════════════════════════════════════════════════

    @app.route("/api/ai/chat", methods=["POST"])
    def ai_chat_endpoint():
        """
        POST /api/ai/chat
        Requires an active Flask session (authenticated user).
        Sends the user's question and optional code context to Groq AI.
        user_id is taken exclusively from the session — never trusted from body.

        Accepted JSON fields:
            question        (str, required)
            mode            (str, optional) — chat|explain|debug|fix|concept|optimize
            language        (str, optional)
            code            (str, optional)
            stdin           (str, optional)
            compiler_output (str, optional)

        Returns:
            200 {"success": true,  "reply": "..."}
            400 {"success": false, "error": "..."}   — bad input
            401 {"success": false, "error": "..."}   — not authenticated
            429 {"success": false, "error": "..."}   — per-session rate limit
            500 {"success": false, "error": "..."}   — provider/server error
        """
        # ── Auth check ────────────────────────────────────────────────
        if "user_id" not in session:
            return jsonify({"success": False, "error": "Authentication required."}), 401

        # ── Per-session soft rate limit (20 requests per session) ─────
        session.setdefault("ai_request_count", 0)
        if session["ai_request_count"] >= 20:
            return jsonify({
                "success": False,
                "error": "You have reached the per-session AI request limit (20). Please log out and back in to continue."
            }), 429

        # ── Validate Content-Type ─────────────────────────────────────
        if not request.is_json:
            return jsonify({"success": False, "error": "Request content-type must be application/json."}), 400

        try:
            data = request.get_json(silent=True)
        except Exception:
            return jsonify({"success": False, "error": "Malformed JSON body."}), 400

        if not data or not isinstance(data, dict):
            return jsonify({"success": False, "error": "Request body must be a JSON object."}), 400

        # ── Extract and validate fields ───────────────────────────────
        question        = (data.get("question")        or "").strip()
        mode            = (data.get("mode")            or "chat").strip().lower()
        language        = (data.get("language")        or "").strip()
        code            = (data.get("code")            or "").strip()
        stdin           = (data.get("stdin")           or "").strip()
        compiler_output = (data.get("compiler_output") or "").strip()

        if not question:
            return jsonify({"success": False, "error": "The 'question' field is required and cannot be empty."}), 400

        if len(question) > 2000:
            return jsonify({"success": False, "error": "Question is too long (max 2000 characters)."}), 400

        if code and len(code) > 8000:
            return jsonify({"success": False, "error": "Code is too long (max 8000 characters)."}), 400

        # ── Call AI service ───────────────────────────────────────────
        result = ai_chat(
            question=question,
            mode=mode,
            language=language if language else None,
            code=code if code else None,
            stdin=stdin if stdin else None,
            compiler_output=compiler_output if compiler_output else None,
        )

        # ── Increment rate-limit counter only on successful calls ─────
        if result.get("success"):
            session["ai_request_count"] = session.get("ai_request_count", 0) + 1
            session.modified = True

        if result.get("success"):
            return jsonify({"success": True, "reply": result["reply"]}), 200

        # Distinguish provider errors (500) from safe user-facing errors (400)
        err_msg = result.get("error", "An unexpected error occurred.")
        return jsonify({"success": False, "error": err_msg}), 500

    return app



app = create_app()

if __name__ == "__main__":
    print(f"Starting CodeForge Flask Backend on port {Config.PORT}...")
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)
