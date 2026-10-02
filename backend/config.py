import os
from dotenv import load_dotenv

# Load environment variables from backend/.env explicitly
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_ENV_PATH = os.path.join(_BASE_DIR, ".env")
load_dotenv(_ENV_PATH, override=True)

class Config:
    """Central Application Configuration, JDoodle API Settings & Auth."""

    # ── JDoodle API Credentials & Endpoint ───────────────────────────
    JDOODLE_API_URL = os.getenv("JDOODLE_API_URL", "https://api.jdoodle.com/v1/execute").strip()
    JDOODLE_CLIENT_ID = os.getenv("JDOODLE_CLIENT_ID", "").strip()
    JDOODLE_CLIENT_SECRET = os.getenv("JDOODLE_CLIENT_SECRET", "").strip()

    # ── Groq AI API ───────────────────────────────────────────────────
    # Add GROQ_API_KEY and GROQ_MODEL to backend/.env.
    # The key is NEVER logged, printed, or exposed to the frontend.
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
    GROQ_MODEL   = os.getenv("GROQ_MODEL", "").strip()

    # ── Flask Server Configuration ────────────────────────────────────
    PORT = int(os.getenv("PORT", 5000))
    DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")

    # ── Flask Session / Auth ──────────────────────────────────────────
    # Read from FLASK_SECRET_KEY in .env.
    # The fallback string is only for local development convenience;
    # production MUST set a real secret via the environment variable.
    SECRET_KEY = os.getenv(
        "FLASK_SECRET_KEY",
        "dev-only-fallback-do-not-use-in-production"
    )

    # Session cookie security settings
    SESSION_COOKIE_HTTPONLY = True      # JS cannot read the session cookie
    # "Lax" works for localhost:5500 → localhost:5000 because both share the
    # same eTLD+1 ("localhost"), making them same-site even though the ports
    # differ. Chrome rejects SameSite=None on HTTP (requires Secure/HTTPS).
    SESSION_COOKIE_SAMESITE = "Lax"    # Same-site: works across localhost ports
    SESSION_COOKIE_SECURE   = False     # Set True in production (HTTPS only)

    # ── Database ──────────────────────────────────────────────────────
    # Resolved at import time; always points to backend/codeforge.db
    _BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_PATH = os.path.join(_BASE_DIR, "codeforge.db")

    # Centralized Language Mapping to JDoodle language & versionIndex
    LANGUAGE_MAP = {
        "C": {"language": "c", "versionIndex": "5"},
        "CPP": {"language": "cpp17", "versionIndex": "1"},
        "C++": {"language": "cpp17", "versionIndex": "1"},
        "JAVA": {"language": "java", "versionIndex": "4"},
        "PYTHON": {"language": "python3", "versionIndex": "4"},
        "PY": {"language": "python3", "versionIndex": "4"}
    }

    @classmethod
    def get_language_config(cls, language_name: str) -> dict:
        """
        Convert frontend language string (case-insensitive) to JDoodle language and versionIndex dict.
        Raises ValueError if language is unsupported.
        """
        if not language_name or not isinstance(language_name, str):
            raise ValueError("Language parameter must be a non-empty string.")

        normalized = language_name.strip().upper()
        if normalized in cls.LANGUAGE_MAP:
            return cls.LANGUAGE_MAP[normalized]

        supported = ", ".join(sorted(list(set(["C", "C++", "Java", "Python"]))))
        raise ValueError(f"Unsupported programming language: '{language_name}'. Supported languages: {supported}.")
