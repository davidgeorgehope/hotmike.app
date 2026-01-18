from datetime import datetime, timedelta
from typing import Optional
from database import get_db
from config import get_settings


class RateLimiter:
    """Rate limiter for AI API calls."""

    def __init__(self):
        self.settings = get_settings()

    def can_make_call(self, user_id: int, session_id: Optional[str] = None, call_type: str = "ai_call") -> dict:
        """Check if the user can make an AI call based on rate limits."""
        now = datetime.utcnow()
        minute_ago = now - timedelta(minutes=1)

        with get_db() as conn:
            cursor = conn.cursor()

            # Check per-minute limit
            cursor.execute(
                """
                SELECT COUNT(*) as count FROM ai_rate_limits
                WHERE user_id = ? AND call_type = ? AND called_at > ?
                """,
                (user_id, call_type, minute_ago.isoformat())
            )
            minute_count = cursor.fetchone()["count"]

            if minute_count >= self.settings.AI_CALLS_PER_MINUTE:
                return {
                    "allowed": False,
                    "reason": "rate_limit_minute",
                    "message": f"Rate limit exceeded. Max {self.settings.AI_CALLS_PER_MINUTE} calls per minute.",
                    "retry_after_seconds": 60
                }

            # Check per-session limit if session_id provided
            if session_id:
                cursor.execute(
                    """
                    SELECT COUNT(*) as count FROM ai_rate_limits
                    WHERE user_id = ? AND session_id = ? AND call_type = ?
                    """,
                    (user_id, session_id, call_type)
                )
                session_count = cursor.fetchone()["count"]

                if session_count >= self.settings.AI_CALLS_PER_SESSION:
                    return {
                        "allowed": False,
                        "reason": "rate_limit_session",
                        "message": f"Session limit exceeded. Max {self.settings.AI_CALLS_PER_SESSION} calls per session.",
                        "retry_after_seconds": None
                    }

        return {
            "allowed": True,
            "reason": None,
            "message": None,
            "retry_after_seconds": None
        }

    def record_call(self, user_id: int, session_id: Optional[str] = None, call_type: str = "ai_call") -> None:
        """Record an AI call for rate limiting."""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO ai_rate_limits (user_id, session_id, call_type)
                VALUES (?, ?, ?)
                """,
                (user_id, session_id, call_type)
            )

    def get_remaining_calls(self, user_id: int, session_id: Optional[str] = None, call_type: str = "ai_call") -> dict:
        """Get the number of remaining calls for the user."""
        now = datetime.utcnow()
        minute_ago = now - timedelta(minutes=1)

        with get_db() as conn:
            cursor = conn.cursor()

            # Get minute count
            cursor.execute(
                """
                SELECT COUNT(*) as count FROM ai_rate_limits
                WHERE user_id = ? AND call_type = ? AND called_at > ?
                """,
                (user_id, call_type, minute_ago.isoformat())
            )
            minute_count = cursor.fetchone()["count"]

            # Get session count if applicable
            session_count = 0
            if session_id:
                cursor.execute(
                    """
                    SELECT COUNT(*) as count FROM ai_rate_limits
                    WHERE user_id = ? AND session_id = ? AND call_type = ?
                    """,
                    (user_id, session_id, call_type)
                )
                session_count = cursor.fetchone()["count"]

        return {
            "minute_remaining": max(0, self.settings.AI_CALLS_PER_MINUTE - minute_count),
            "minute_limit": self.settings.AI_CALLS_PER_MINUTE,
            "session_remaining": max(0, self.settings.AI_CALLS_PER_SESSION - session_count) if session_id else None,
            "session_limit": self.settings.AI_CALLS_PER_SESSION if session_id else None,
        }

    def cleanup_old_records(self, hours: int = 24) -> int:
        """Clean up old rate limit records. Returns number of deleted records."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM ai_rate_limits WHERE called_at < ?",
                (cutoff.isoformat(),)
            )
            deleted = cursor.rowcount

        return deleted


# Singleton instance
rate_limiter = RateLimiter()


def get_rate_limiter() -> RateLimiter:
    """Get the rate limiter singleton."""
    return rate_limiter
