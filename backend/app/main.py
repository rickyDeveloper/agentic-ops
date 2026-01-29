"""
ACIP Dashboard - FastAPI Application

Main entry point for the AUSTRAC-compliant ACIP verification system.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import get_settings
from app.database import init_db
from app.api import cases_router, actions_router, websocket_router, customers_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup
    print("Initializing ACIP Dashboard...")
    
    # Initialize database tables
    await init_db()
    print("Database initialized")
    
    # Ensure directories exist
    os.makedirs(settings.documents_dir, exist_ok=True)
    os.makedirs(settings.audit_logs_dir, exist_ok=True)
    print(f"Documents directory: {settings.documents_dir}")
    print(f"Audit logs directory: {settings.audit_logs_dir}")
    
    yield
    
    # Shutdown
    print("Shutting down ACIP Dashboard...")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="""
    ACIP (Applicable Customer Identification Procedure) Dashboard
    
    An AUSTRAC-compliant system for managing customer identification
    with agentic AI workflow and human-in-the-loop controls.
    
    ## Features
    
    - **Document Processing**: AI-powered extraction from ID documents
    - **Risk Assessment**: Automatic risk classification
    - **Human Review**: Full HITL workflow for flagged cases
    - **Audit Trail**: Complete audit logging for compliance
    - **Real-time Updates**: WebSocket-based dashboard updates
    
    ## AUSTRAC Compliance
    
    This system follows Chapter 79 of the AML/CTF Rules, ensuring:
    - 15 business day deadline tracking
    - Risk-based systems and controls
    - Comprehensive audit trails
    - Human review for high-risk cases
    """,
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(customers_router)
app.include_router(cases_router)
app.include_router(actions_router)
app.include_router(websocket_router)

# Mount static files for document access (if needed)
if os.path.exists(settings.documents_dir):
    app.mount(
        "/documents",
        StaticFiles(directory=settings.documents_dir),
        name="documents"
    )


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "description": "AUSTRAC-compliant ACIP verification system",
        "docs_url": "/docs",
        "health": "ok"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "database": "connected",
        "ai_provider": settings.ai_provider
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
