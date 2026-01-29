"""WebSocket support for real-time dashboard updates."""

import json
from typing import List
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific client."""
        await websocket.send_json(message)
    
    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn)


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/cases")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time case updates.
    
    Clients connect to receive:
    - new_case: When a new ACIP case is created
    - case_update: When a case status changes
    - action_taken: When a human action is performed
    """
    await manager.connect(websocket)
    
    # Send initial connection confirmation
    await manager.send_personal_message({
        "type": "connected",
        "message": "Connected to ACIP Dashboard",
        "timestamp": datetime.utcnow().isoformat()
    }, websocket)
    
    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_text()
            
            # Handle ping/pong for connection keepalive
            if data == "ping":
                await manager.send_personal_message({
                    "type": "pong",
                    "timestamp": datetime.utcnow().isoformat()
                }, websocket)
            else:
                # Echo back any other messages (could be extended for client commands)
                try:
                    message = json.loads(data)
                    await manager.send_personal_message({
                        "type": "ack",
                        "received": message,
                        "timestamp": datetime.utcnow().isoformat()
                    }, websocket)
                except json.JSONDecodeError:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "Invalid JSON",
                        "timestamp": datetime.utcnow().isoformat()
                    }, websocket)
                    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
