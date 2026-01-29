"""
Real-time Activity Logger for Agentic Workflow

Provides a centralized way for agents to log their activities
which are then broadcast via WebSocket for live UI updates.
"""

import asyncio
from datetime import datetime
from typing import Optional, Callable, List, Dict, Any
from dataclasses import dataclass, asdict
from enum import Enum


class AgentType(str, Enum):
    DOCUMENT_INSPECTOR = "document_inspector"
    EXTERNAL_VERIFIER = "external_verifier"
    COMPLIANCE_OFFICER = "compliance_officer"
    SYSTEM = "system"


class ActivityStatus(str, Enum):
    STARTED = "started"
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"
    DECISION = "decision"


@dataclass
class ActivityEntry:
    """Single activity log entry"""
    timestamp: str
    case_id: str
    agent: str
    agent_display_name: str
    action: str
    details: str
    status: str
    duration_ms: Optional[int] = None
    data: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> dict:
        return asdict(self)


class ActivityLogger:
    """
    Centralized activity logger that collects agent activities
    and broadcasts them for real-time UI updates.
    """
    
    def __init__(self):
        self._activities: Dict[str, List[ActivityEntry]] = {}
        self._broadcast_callback: Optional[Callable] = None
        self._start_times: Dict[str, datetime] = {}
    
    def set_broadcast_callback(self, callback: Callable):
        """Set the async callback for broadcasting activities"""
        self._broadcast_callback = callback
    
    def _get_agent_display_name(self, agent: AgentType) -> str:
        names = {
            AgentType.DOCUMENT_INSPECTOR: "🔍 Document Inspector Agent",
            AgentType.EXTERNAL_VERIFIER: "🌐 External Verifier Agent",
            AgentType.COMPLIANCE_OFFICER: "⚖️ Compliance Officer Agent",
            AgentType.SYSTEM: "🤖 System"
        }
        return names.get(agent, str(agent))
    
    def log(
        self,
        case_id: str,
        agent: AgentType,
        action: str,
        details: str,
        status: ActivityStatus,
        data: Optional[Dict[str, Any]] = None
    ) -> ActivityEntry:
        """Log an activity and broadcast it"""
        
        # Calculate duration if this is completing an action
        duration_ms = None
        action_key = f"{case_id}:{agent}:{action}"
        if status in [ActivityStatus.SUCCESS, ActivityStatus.ERROR, ActivityStatus.WARNING]:
            if action_key in self._start_times:
                delta = datetime.utcnow() - self._start_times[action_key]
                duration_ms = int(delta.total_seconds() * 1000)
                del self._start_times[action_key]
        elif status == ActivityStatus.STARTED:
            self._start_times[action_key] = datetime.utcnow()
        
        entry = ActivityEntry(
            timestamp=datetime.utcnow().isoformat(),
            case_id=case_id,
            agent=agent.value,
            agent_display_name=self._get_agent_display_name(agent),
            action=action,
            details=details,
            status=status.value,
            duration_ms=duration_ms,
            data=data
        )
        
        # Store in memory
        if case_id not in self._activities:
            self._activities[case_id] = []
        self._activities[case_id].append(entry)
        
        # Print to console for visibility
        status_icons = {
            "started": "▶️",
            "in_progress": "⏳",
            "success": "✅",
            "warning": "⚠️",
            "error": "❌",
            "decision": "🎯"
        }
        icon = status_icons.get(status.value, "•")
        duration_str = f" ({duration_ms}ms)" if duration_ms else ""
        print(f"[{entry.agent_display_name}] {icon} {action}: {details}{duration_str}")
        
        # Broadcast via callback if set
        if self._broadcast_callback:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(self._broadcast(entry))
            except RuntimeError:
                pass  # No event loop, skip broadcast
        
        return entry
    
    async def _broadcast(self, entry: ActivityEntry):
        """Broadcast activity to WebSocket clients"""
        if self._broadcast_callback:
            await self._broadcast_callback({
                "type": "agent_activity",
                **entry.to_dict()
            })
    
    def get_activities(self, case_id: str) -> List[ActivityEntry]:
        """Get all activities for a case"""
        return self._activities.get(case_id, [])
    
    def clear_activities(self, case_id: str):
        """Clear activities for a case"""
        if case_id in self._activities:
            del self._activities[case_id]


# Global singleton instance
activity_logger = ActivityLogger()
