"""API routes."""

from app.api.cases import router as cases_router
from app.api.actions import router as actions_router
from app.api.websocket import router as websocket_router
from app.api.customers import router as customers_router

__all__ = ["cases_router", "actions_router", "websocket_router", "customers_router"]
