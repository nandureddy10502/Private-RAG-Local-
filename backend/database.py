"""
Database module for Privacy-Preserving Local RAG.

Provides user authentication and per-user chat history storage
using Python's built-in sqlite3 database (local_rag.db).
"""

from datetime import datetime
import json
from pathlib import Path
import sqlite3
from typing import Optional, List, Dict, Any

DB_PATH = Path(__file__).parent / "local_rag.db"


def get_db_connection() -> sqlite3.Connection:
    """Creates a new SQLite connection with Row factory enabled."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db():
    """
    Initializes local_rag.db schema:
    - users (id, username, password)
    - chat_history (id, user_id, role, content, timestamp, citations)
    Inserts default demo users:
    - 'admin' ('admin123')
    - 'guest' ('guest123')
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. Create users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            );
        """)

        # 2. Create chat_history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                citations TEXT,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        """)

        # 3. Create index for fast user history queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_chat_history_user_timestamp
            ON chat_history (user_id, timestamp);
        """)

        # 4. Seed default demo accounts
        cursor.execute("""
            INSERT OR IGNORE INTO users (id, username, password)
            VALUES (1, 'admin', 'admin123');
        """)
        cursor.execute("""
            INSERT OR IGNORE INTO users (id, username, password)
            VALUES (2, 'guest', 'guest123');
        """)

        conn.commit()


def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """
    Verifies user credentials against the SQLite users table.
    Returns a dict with 'id' and 'username' if valid, else None.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username FROM users WHERE username = ? AND password = ?;",
            (username.strip(), password),
        )
        row = cursor.fetchone()
        if row:
            return {"id": row["id"], "username": row["username"]}
        return None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Fetches user details by ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username FROM users WHERE id = ?;", (user_id,))
        row = cursor.fetchone()
        if row:
            return {"id": row["id"], "username": row["username"]}
        return None


def save_chat_message(
    user_id: int,
    role: str,
    content: str,
    citations: Optional[List[Dict[str, Any]]] = None,
    timestamp: Optional[str] = None,
) -> int:
    """
    Saves a message (user or assistant) to chat_history.

    Args:
        user_id: Foreign key ID of the user.
        role: 'user' or 'assistant'.
        content: Text content of the message.
        citations: Optional list of source citation dicts (stored as JSON string).
        timestamp: ISO format timestamp string (defaults to current UTC time).

    Returns:
        The inserted row ID.
    """
    if timestamp is None:
        timestamp = datetime.utcnow().isoformat()

    citations_json = json.dumps(citations) if citations is not None else None

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO chat_history (user_id, role, content, timestamp, citations)
            VALUES (?, ?, ?, ?, ?);
            """,
            (user_id, role, content, timestamp, citations_json),
        )
        conn.commit()
        return cursor.lastrowid


def get_chat_history(user_id: int) -> List[Dict[str, Any]]:
    """
    Fetches the chat history for a specific user from SQLite,
    ordered by timestamp ascending.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, user_id, role, content, timestamp, citations
            FROM chat_history
            WHERE user_id = ?
            ORDER BY timestamp ASC, id ASC;
            """,
            (user_id,),
        )
        rows = cursor.fetchall()

        history = []
        for r in rows:
            citations_data = []
            if r["citations"]:
                try:
                    citations_data = json.loads(r["citations"])
                except Exception:
                    citations_data = []

            history.append({
                "id": r["id"],
                "user_id": r["user_id"],
                "role": r["role"],
                "content": r["content"],
                "timestamp": r["timestamp"],
                "citations": citations_data,
            })
        return history


# Automatically ensure tables and default users exist upon module import
init_db()


if __name__ == "__main__":
    print(f"Database initialized at: {DB_PATH.resolve()}")
    admin_auth = authenticate_user("admin", "admin123")
    print("Admin Auth Test:", admin_auth)
    guest_auth = authenticate_user("guest", "guest123")
    print("Guest Auth Test:", guest_auth)
    bad_auth = authenticate_user("admin", "wrongpassword")
    print("Bad Auth Test (should be None):", bad_auth)

