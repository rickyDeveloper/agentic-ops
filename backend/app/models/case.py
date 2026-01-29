"""ACIP Case model."""

import uuid
import enum
from datetime import datetime, timedelta
from sqlalchemy import Column, String, DateTime, Enum, Text, JSON, TypeDecorator
from sqlalchemy.orm import relationship
from app.database import Base


class UUID_Type(TypeDecorator):
    """Platform-independent UUID type."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return uuid.UUID(value)
        return value


class CaseStatus(str, enum.Enum):
    """ACIP case status following the workflow state machine."""
    PENDING = "pending"
    PROCESSING = "processing"
    AI_REVIEW = "ai_review"
    AWAITING_HUMAN = "awaiting_human"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"
    DOCS_REQUESTED = "docs_requested"
    VERIFIED = "verified"  # Auto-approved for low risk


class RiskLevel(str, enum.Enum):
    """Risk classification for ACIP cases."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    UNKNOWN = "unknown"


class ACIPCase(Base):
    """
    ACIP Case representing a customer identification request.
    
    Per AUSTRAC guidelines, ACIP must be completed within 15 business days
    of opening an account.
    """
    __tablename__ = "acip_cases"
    
    id = Column(UUID_Type(), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Customer information
    customer_name = Column(String(255), nullable=False)
    customer_email = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    
    # Document information
    document_path = Column(String(500), nullable=False)
    document_type = Column(String(100), nullable=True)
    
    # Processing status
    status = Column(
        Enum(CaseStatus),
        default=CaseStatus.PENDING,
        nullable=False,
        index=True
    )
    risk_level = Column(
        Enum(RiskLevel),
        default=RiskLevel.UNKNOWN,
        nullable=False
    )
    
    # AI extraction results
    extracted_data = Column(JSON, nullable=True)
    verification_result = Column(JSON, nullable=True)
    ai_confidence_score = Column(String(10), nullable=True)
    ai_decision = Column(String(20), nullable=True)  # APPROVE, REJECT, ESCALATE
    
    # Assignment and workflow
    assigned_to = Column(String(255), nullable=True)
    escalated_to = Column(String(255), nullable=True)
    
    # Notes and comments
    notes = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    
    # LangGraph state tracking
    langgraph_thread_id = Column(String(100), nullable=True, index=True)
    langgraph_checkpoint_id = Column(String(100), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deadline_at = Column(DateTime, nullable=True)  # AUSTRAC 15 business day deadline
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    actions = relationship("CaseAction", back_populates="case", lazy="selectin")
    audit_logs = relationship("AuditLog", back_populates="case", lazy="selectin")
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Set deadline to 15 business days from creation (AUSTRAC requirement)
        if not self.deadline_at:
            self.deadline_at = self._calculate_deadline(15)
    
    def _calculate_deadline(self, business_days: int) -> datetime:
        """Calculate deadline excluding weekends."""
        deadline = datetime.utcnow()
        days_added = 0
        while days_added < business_days:
            deadline += timedelta(days=1)
            if deadline.weekday() < 5:  # Monday = 0, Friday = 4
                days_added += 1
        return deadline
    
    @property
    def is_overdue(self) -> bool:
        """Check if case has exceeded AUSTRAC deadline."""
        if self.deadline_at and self.status not in [
            CaseStatus.APPROVED, 
            CaseStatus.REJECTED, 
            CaseStatus.VERIFIED
        ]:
            return datetime.utcnow() > self.deadline_at
        return False
    
    @property
    def days_until_deadline(self) -> int:
        """Calculate business days remaining until deadline."""
        if not self.deadline_at:
            return 0
        delta = self.deadline_at - datetime.utcnow()
        return max(0, delta.days)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "customer_name": self.customer_name,
            "customer_email": self.customer_email,
            "customer_phone": self.customer_phone,
            "document_path": self.document_path,
            "document_type": self.document_type,
            "status": self.status.value,
            "risk_level": self.risk_level.value,
            "extracted_data": self.extracted_data,
            "verification_result": self.verification_result,
            "ai_confidence_score": self.ai_confidence_score,
            "ai_decision": self.ai_decision,
            "assigned_to": self.assigned_to,
            "escalated_to": self.escalated_to,
            "notes": self.notes,
            "rejection_reason": self.rejection_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deadline_at": self.deadline_at.isoformat() if self.deadline_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "is_overdue": self.is_overdue,
            "days_until_deadline": self.days_until_deadline
        }
