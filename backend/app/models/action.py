"""Case Action model for human-in-the-loop actions."""

import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.case import UUID_Type


class ActionType(str, enum.Enum):
    """Types of actions that can be performed on a case."""
    APPROVE = "approve"
    REJECT = "reject"
    ESCALATE = "escalate"
    REQUEST_DOCS = "request_docs"
    MANUAL_OVERRIDE = "manual_override"
    ADD_NOTE = "add_note"
    ASSIGN = "assign"
    RESUME = "resume"  # Resume workflow after human input


class CaseAction(Base):
    """
    Records human-in-the-loop actions taken on ACIP cases.
    
    Each action is immutable and creates a complete audit trail
    of all decisions made during the ACIP process.
    """
    __tablename__ = "case_actions"
    
    id = Column(UUID_Type(), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(
        UUID_Type(), 
        ForeignKey("acip_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Action details
    action_type = Column(Enum(ActionType), nullable=False)
    performed_by = Column(String(255), nullable=False)
    
    # Additional context
    notes = Column(Text, nullable=True)
    previous_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    
    # For escalation
    escalated_to = Column(String(255), nullable=True)
    
    # For document requests
    requested_documents = Column(Text, nullable=True)
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    case = relationship("ACIPCase", back_populates="actions")
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "case_id": str(self.case_id),
            "action_type": self.action_type.value,
            "performed_by": self.performed_by,
            "notes": self.notes,
            "previous_status": self.previous_status,
            "new_status": self.new_status,
            "escalated_to": self.escalated_to,
            "requested_documents": self.requested_documents,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
