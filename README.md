# CodeForge — Online Compiler & Code Execution Platform

A full-stack web application for writing, executing, and debugging code in a browser. Built with a **Python Flask** backend, **JDoodle Compiler API** for sandboxed code execution, **Groq AI** for an intelligent coding assistant, and **SQLite** for persistent user authentication and execution history.

---

## Features

| Feature | Details |
|---|---|
| **Multi-Language Execution** | C, C++ (cpp17), Java, Python 3 via JDoodle API |
| **User Authentication** | Signup, login, logout with Flask sessions + Werkzeug password hashing |
| **Execution History** | Per-user SQLite history; view and clear previous executions |
| **AI Assistant** | Groq-powered chat with modes: explain, debug, fix, concept, optimize |
| **Sandboxed Execution** | No local `exec`, `subprocess`, or `os.system` — 100% via JDoodle |
| **Auth-Guarded Endpoints** | Execute, history, and AI chat all require an active session |
| **Session Rate Limiting** | AI chat is limited to 20 requests per session |
| **Input Validation** | Empty code, unsupported languages, short passwords, invalid emails rejected |

---

## Technology Stack

### Frontend
- **HTML5**, **CSS3**, **Vanilla JavaScript (ES6+)**
- Pages: Landing, Compiler, Login, Signup, History, AI Assistant
- Route protection via `auth-guard.js`

### Backend
- **Python 3.10+**, **Flask 3**, **Flask-CORS**, **Werkzeug**, **SQLite**, **python-dotenv**
- **Groq Python SDK** — AI assistant integration
- **Requests** — HTTP client for JDoodle API

### External Services
- **JDoodle Compiler API** — `https://api.jdoodle.com/v1/execute` (sandboxed cloud execution)
- **Groq API** — AI model inference

---

## Architecture

```
Browser (HTML + CSS + Vanilla JS)
    |
    | Fetch API -- HTTP to localhost:5000
    v
Flask REST API (app.py -- application factory)
    |
    +-- /api/auth/*       Authentication endpoints
    +-- /api/execute      Code execution (auth required)
    +-- /api/history      Execution history (auth required)
    +-- /api/ai/chat      AI assistant (auth required)
    +-- /health           Health check (no auth)
    |
    +-- JDoodle Service  --> JDoodle Compiler API (cloud)
    +-- AI Service       --> Groq API (cloud)
    +-- SQLite Database  --> codeforge.db (local)
```

---

## Project Structure

```
Online Compiler and Code Execution Platform/
|
+-- frontend/
|   +-- index.html           Landing page
|   +-- compiler.html        Main compiler interface
|   +-- login.html / login.js
|   +-- signup.html / signup.js
|   +-- history.html / history.js
|   +-- ai-assistant.html / ai-assistant.js / ai-assistant.css
|   +-- auth-guard.js        Route protection
|   +-- dashboard.js         Dashboard logic
|   +-- script.js            Landing page script
|   +-- style.css            Global stylesheet
|   +-- auth.css             Auth page styles
|
+-- backend/
|   +-- app.py               Flask application factory -- all routes
|   +-- config.py            Centralised config + language mapping
|   +-- database.py          SQLite init + connection helper
|   +-- requirements.txt     Python dependencies
|   +-- codeforge.db         SQLite database (auto-created on startup)
|   +-- .env                 Environment variables (never committed)
|   +-- .env.example         Template for setting up .env
|   +-- test_session.py      Session isolation integration test
|   |
|   +-- services/
|   |   +-- jdoodle_service.py   JDoodle API client
|   |   +-- ai_service.py        Groq AI client
|   |
|   +-- models/
|   |   +-- execution.py         ExecutionRequest + ExecutionResponse dataclasses
|   |
|   +-- tests/
|       +-- test_app.py          Unit test suite (18 tests)
|
+-- .gitignore
+-- README.md
```

---

## Environment Variables

Create `backend/.env` (copy from `backend/.env.example`):

```env
JDOODLE_CLIENT_ID=your_jdoodle_client_id
JDOODLE_CLIENT_SECRET=your_jdoodle_client_secret
PORT=5000
FLASK_SECRET_KEY=your_random_secret_key_here
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b
```

> **Security:** `.env` is in `.gitignore`. Never commit it. API keys are never logged, printed, or sent to the frontend.

To get credentials:
- **JDoodle**: Register at [jdoodle.com/compiler-api](https://www.jdoodle.com/compiler-api/)
- **Groq**: Register at [console.groq.com](https://console.groq.com)
- **Flask Secret Key**: `python -c "import secrets; print(secrets.token_hex(32))"`

---

## How to Run

### Terminal (two separate terminals)

**Terminal 1 -- Backend:**
```cmd
cd backend
pip install -r requirements.txt
python app.py
```
Backend starts on `http://localhost:5000`

**Terminal 2 -- Frontend:**
```cmd
cd frontend
python -m http.server 5500
```
Frontend available at `http://localhost:5500`

### Antigravity IDE

1. Open a terminal panel, navigate to `backend/`, run `python app.py`
2. Open a second terminal panel, navigate to `frontend/`, run `python -m http.server 5500`
3. Open `http://localhost:5500` in the browser

> Flask CORS is configured to accept requests from `localhost:5500` and `127.0.0.1:5500` with session credentials.

---

## REST API Reference

All `/api/*` endpoints except `/api/auth/signup` and `/api/auth/login` require an active Flask session cookie.

### Authentication

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | `{name, email, password}` | Create account (min 6-char password) |
| POST | `/api/auth/login` | `{email, password}` | Login, set session cookie |
| POST | `/api/auth/logout` | -- | Clear session |
| GET | `/api/auth/me` | -- | Returns `{authenticated, user}` |

### Code Execution (requires auth)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/execute` | `{language, sourceCode, stdin}` | Execute code, save to history |

Supported `language` values: `C`, `CPP`, `C++`, `JAVA`, `PYTHON`, `PY`

### Execution History (requires auth)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/history` | Returns all executions for current user (newest first) |
| DELETE | `/api/history` | Deletes all history for current user only |

### AI Assistant (requires auth)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/ai/chat` | `{question, mode?, language?, code?, stdin?, compiler_output?}` | AI response |

Supported `mode` values: `chat`, `explain`, `debug`, `fix`, `concept`, `optimize`

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Returns `{status: "UP"}` -- no auth required |

---

## Database Schema

SQLite at `backend/codeforge.db` (auto-created on first startup):

```sql
CREATE TABLE users (
    id            INTEGER  PRIMARY KEY AUTOINCREMENT,
    name          TEXT     NOT NULL,
    email         TEXT     UNIQUE NOT NULL,
    password_hash TEXT     NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE executions (
    id             INTEGER  PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER  NOT NULL REFERENCES users(id),
    language       TEXT     NOT NULL,
    source_code    TEXT,
    stdin          TEXT,
    stdout         TEXT,
    stderr         TEXT,
    compile_output TEXT,
    status         TEXT,
    execution_time TEXT,
    memory         TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Testing

### Unit Tests (18 tests)
```bash
cd backend
python -m unittest discover -s tests -v
```

Covers: health check, language mapping, auth guards (401 without session), input validation, mocked JDoodle responses, auth endpoint validation (duplicate email, invalid email, short password, wrong credentials), login/logout/me, history auth guard, AI chat auth guard and empty question.

### Session Isolation Test
```bash
cd backend
python test_session.py
```

Tests that two users cannot see each other's history, history persists across re-logins, and clearing one user's history does not affect another.

---

## Security Principles

1. **Server-Side Credentials** -- JDoodle and Groq keys are in `.env` only, never sent to the frontend
2. **No Local Execution** -- User code never runs via `exec()`, `eval()`, `subprocess`, or `os.system()`
3. **Password Hashing** -- Werkzeug `pbkdf2:sha256`; plaintext passwords are never stored
4. **Session-Based Auth** -- `user_id` is always read from the Flask session, never from the request body
5. **Input Validation** -- Empty code, unsupported languages, malformed JSON all rejected before any external call
6. **CORS with Credentials** -- Restricted to explicit trusted origins; wildcard `*` is not used
7. **AI Rate Limit** -- 20 AI requests per session to prevent abuse

---

## Known Limitations

- **JDoodle Free Tier**: 200 executions/day. Once exhausted, execute returns a "daily limit" error.
- **AI Model**: `openai/gpt-oss-20b` via Groq. Model availability depends on Groq tier.
- **No HTTPS**: `SESSION_COOKIE_SECURE` is `False` for local dev; set to `True` in production with HTTPS.
- **No Password Reset**: No forgot-password or email verification flow is implemented.
