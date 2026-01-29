"""Application configuration using Pydantic settings."""

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    app_name: str = "ACIP Dashboard"
    debug: bool = False
    
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/acip_db"
    database_url_sync: str = "postgresql://postgres:postgres@localhost:5432/acip_db"
    
    # AI Providers
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    ai_provider: str = "gemini"  # or "openai"
    
    # ACIP Settings (AUSTRAC compliance)
    acip_deadline_days: int = 15  # 15 business days per AUSTRAC
    auto_approve_low_risk: bool = True
    
    # File storage
    documents_dir: str = "documents"
    audit_logs_dir: str = "audit_logs"
    
    class Config:
        env_file = ".env"
        extra = "ignore"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
