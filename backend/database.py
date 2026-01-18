import sqlite3
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).parent.parent / "data" / "db" / "hotmike.db"

def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recordings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                title TEXT NOT NULL,
                duration_seconds REAL,
                file_size INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                name_card_text TEXT DEFAULT '',
                name_card_title TEXT DEFAULT '',
                pip_position TEXT DEFAULT 'bottom-right',
                pip_size TEXT DEFAULT 'medium',
                pip_shape TEXT DEFAULT 'circle',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Add pip_shape column if it doesn't exist (migration for existing DBs)
        cursor.execute("PRAGMA table_info(user_preferences)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'pip_shape' not in columns:
            cursor.execute("ALTER TABLE user_preferences ADD COLUMN pip_shape TEXT DEFAULT 'circle'")

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id)")

        # Manual overlays table - user-uploaded images
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS manual_overlays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_manual_overlays_user_id ON manual_overlays(user_id)")

        # Talk tracks table - scripts with [VISUAL:] markers
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS talk_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_talk_tracks_user_id ON talk_tracks(user_id)")

        # Prebaked visuals table - pre-generated images from markers
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS prebaked_visuals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                talk_track_id INTEGER NOT NULL,
                marker_text TEXT NOT NULL,
                marker_index INTEGER NOT NULL,
                image_filename TEXT,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                generated_at TIMESTAMP,
                FOREIGN KEY (talk_track_id) REFERENCES talk_tracks(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_prebaked_visuals_talk_track_id ON prebaked_visuals(talk_track_id)")

        # AI suggestions table - runtime suggestions during recording
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_suggestions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT NOT NULL,
                transcript_context TEXT,
                suggestion_text TEXT NOT NULL,
                image_url TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_suggestions_user_session ON ai_suggestions(user_id, session_id)")

        # Transcriptions table - speech-to-text segments
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transcriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT NOT NULL,
                segment_text TEXT NOT NULL,
                start_time REAL,
                end_time REAL,
                confidence REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transcriptions_user_session ON transcriptions(user_id, session_id)")

        # AI rate limits table - per-minute and per-session limits
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_rate_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT,
                call_type TEXT NOT NULL,
                called_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user ON ai_rate_limits(user_id, called_at)")
