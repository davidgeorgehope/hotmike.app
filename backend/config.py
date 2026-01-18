from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from pathlib import Path

# Load .env file if it exists
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)


class Settings(BaseSettings):
    # Gemini AI settings
    GEMINI_API_KEY: str = ""
    AI_FEATURES_ENABLED: bool = True
    AI_CALLS_PER_MINUTE: int = 3
    AI_CALLS_PER_SESSION: int = 20

    # App settings
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def is_ai_available() -> bool:
    """Check if AI features are available and configured."""
    settings = get_settings()
    return bool(settings.GEMINI_API_KEY and settings.AI_FEATURES_ENABLED)


def get_ai_status() -> dict:
    """Get detailed AI status for the frontend."""
    settings = get_settings()
    return {
        "available": is_ai_available(),
        "enabled": settings.AI_FEATURES_ENABLED,
        "configured": bool(settings.GEMINI_API_KEY),
        "rate_limits": {
            "calls_per_minute": settings.AI_CALLS_PER_MINUTE,
            "calls_per_session": settings.AI_CALLS_PER_SESSION,
        }
    }
