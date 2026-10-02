"""
database.py — CodeForge SQLite Database Helper

Provides:
    - get_db_connection(): returns a sqlite3 connection with Row factory
    - init_db(): creates the users AND executions tables if they do not
                 already exist. Safe to call on every Flask startup —
                 does NOT drop or re-create data that already exists.

SQLite is built into Python; no extra package is required.
"""

import sqlite3
import os

# Resolve the path to codeforge.db relative to this file's directory
# so it works regardless of where `python app.py` is called from.
_BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(_BASE_DIR, "codeforge.db")


def get_db_connection() -> sqlite3.Connection:
    """
    Open and return a SQLite connection to codeforge.db.
    Row factory is set to sqlite3.Row so columns can be accessed
    by name (e.g. row["email"]) in addition to index.
    """
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    # Enable foreign key enforcement
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """
    Create the users and executions tables if they do not already exist.
    This is idempotent — safe to call on every server startup.
    Existing rows and the database file are NEVER deleted.

    Schema:
        users
        ─────
        id            INTEGER  PRIMARY KEY AUTOINCREMENT
        name          TEXT     NOT NULL
        email         TEXT     UNIQUE NOT NULL
        password_hash TEXT     NOT NULL
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP

        executions
        ──────────
        id             INTEGER  PRIMARY KEY AUTOINCREMENT
        user_id        INTEGER  NOT NULL  → REFERENCES users(id)
        language       TEXT     NOT NULL
        source_code    TEXT
        stdin          TEXT
        stdout         TEXT
        stderr         TEXT
        compile_output TEXT
        status         TEXT
        execution_time TEXT
        memory         TEXT
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    """
    conn = get_db_connection()
    try:
        # ── users table (unchanged from v1) ─────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER  PRIMARY KEY AUTOINCREMENT,
                name          TEXT     NOT NULL,
                email         TEXT     UNIQUE NOT NULL,
                password_hash TEXT     NOT NULL,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── executions table (new in v2) ─────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS executions (
                id             INTEGER   PRIMARY KEY AUTOINCREMENT,
                user_id        INTEGER   NOT NULL,
                language       TEXT      NOT NULL,
                source_code    TEXT,
                stdin          TEXT,
                stdout         TEXT,
                stderr         TEXT,
                compile_output TEXT,
                status         TEXT,
                execution_time TEXT,
                memory         TEXT,
                created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        conn.commit()
        print("[CodeForge] Database initialised - users + executions tables ready.")
    finally:
        conn.close()
