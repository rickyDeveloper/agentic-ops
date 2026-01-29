"""Audit Log model for comprehensive audit trails."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.case import UUID_Type


class AuditLog(Base):
    """
    Comprehensive audit log for ACIP processing.
    
    Per AUSTRAC requirements, all steps in the customer identification
    process must be fully documented and auditable.
    """
    __tablename__ = "audit_logs"
    
    id = Column(UUID_Type(), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(
        UUID_Type(), 
        ForeignKey("acip_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Step information
    step_name = Column(String(255), nullable=False)
    step_number = Column(String(10), nullable=True)
    
    # Details
    details = Column(Text, nullable=True)
    
    # Data snapshots
    extracted_data = Column(JSON, nullable=True)
    verification_result = Column(JSON, nullable=True)
    
    # LangGraph tracking
    langgraph_node = Column(String(100), nullable=True)
    langgraph_state = Column(JSON, nullable=True)
    
    # Document references
    screenshot_path = Column(String(500), nullable=True)
    document_path = Column(String(500), nullable=True)
    
    # Actor information
    performed_by = Column(String(255), nullable=True)  # "system", "ai", or username
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    case = relationship("ACIPCase", back_populates="audit_logs")
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "case_id": str(self.case_id),
            "step_name": self.step_name,
            "step_number": self.step_number,
            "details": self.details,
            "extracted_data": self.extracted_data,
            "verification_result": self.verification_result,
            "langgraph_node": self.langgraph_node,
            "screenshot_path": self.screenshot_path,
            "document_path": self.document_path,
            "performed_by": self.performed_by,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
