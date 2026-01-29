"""Database configuration and session management."""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import create_engine, event
from app.config import get_settings

settings = get_settings()

# Check if using SQLite
is_sqlite = "sqlite" in settings.database_url

# Async engine for FastAPI
engine_kwargs = {
    "echo": settings.debug,
    "future": True
}

# SQLite needs special handling
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

async_engine = create_async_engine(
    settings.database_url,
    **engine_kwargs
)

# Sync engine for Alembic migrations
sync_kwargs = {"echo": settings.debug}
if is_sqlite:
    sync_kwargs["connect_args"] = {"check_same_thread": False}

sync_engine = create_engine(
    settings.database_url_sync,
    **sync_kwargs
)

# Enable foreign keys for SQLite
if is_sqlite:
    @event.listens_for(sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependency to get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database tables."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
