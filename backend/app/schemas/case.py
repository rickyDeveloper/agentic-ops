"""Pydantic schemas for ACIP cases."""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


class CaseStatusEnum(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    AI_REVIEW = "ai_review"
    AWAITING_HUMAN = "awaiting_human"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"
    DOCS_REQUESTED = "docs_requested"
    VERIFIED = "verified"


class RiskLevelEnum(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    UNKNOWN = "unknown"


class ActionTypeEnum(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"
    ESCALATE = "escalate"
    REQUEST_DOCS = "request_docs"
    MANUAL_OVERRIDE = "manual_override"
    ADD_NOTE = "add_note"
    ASSIGN = "assign"
    RESUME = "resume"


# ============== Case Schemas ==============

class CaseCreate(BaseModel):
    """Schema for creating a new ACIP case."""
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None
    document_path: str = Field(..., min_length=1)
    notes: Optional[str] = None


class CaseUpdate(BaseModel):
    """Schema for updating an ACIP case."""
    customer_name: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None


class CaseResponse(BaseModel):
    """Schema for case response."""
    id: str
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    document_path: str
    document_type: Optional[str] = None
    status: CaseStatusEnum
    risk_level: RiskLevelEnum
    extracted_data: Optional[dict] = None
    verification_result: Optional[dict] = None
    ai_confidence_score: Optional[str] = None
    ai_decision: Optional[str] = None
    assigned_to: Optional[str] = None
    escalated_to: Optional[str] = None
    notes: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deadline_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    is_overdue: bool = False
    days_until_deadline: int = 0
    actions: List["ActionResponse"] = []
    
    class Config:
        from_attributes = True


class CaseListResponse(BaseModel):
    """Schema for paginated case list."""
    cases: List[CaseResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============== Action Schemas ==============

class ActionCreate(BaseModel):
    """Schema for creating a case action."""
    action_type: ActionTypeEnum
    performed_by: str = Field(..., min_length=1, max_length=255)
    notes: Optional[str] = None
    escalated_to: Optional[str] = None
    requested_documents: Optional[str] = None
    # For manual override
    override_data: Optional[dict] = None


class ActionResponse(BaseModel):
    """Schema for action response."""
    id: str
    case_id: str
    action_type: ActionTypeEnum
    performed_by: str
    notes: Optional[str] = None
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    escalated_to: Optional[str] = None
    requested_documents: Optional[str] = None
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============== Audit Log Schemas ==============

class AuditLogResponse(BaseModel):
    """Schema for audit log response."""
    id: str
    case_id: str
    step_name: str
    step_number: Optional[str] = None
    details: Optional[str] = None
    extracted_data: Optional[dict] = None
    verification_result: Optional[dict] = None
    langgraph_node: Optional[str] = None
    screenshot_path: Optional[str] = None
    document_path: Optional[str] = None
    performed_by: Optional[str] = None
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============== WebSocket Schemas ==============

class WebSocketMessage(BaseModel):
    """Schema for WebSocket messages."""
    type: str  # "case_update", "new_case", "action_taken"
    case_id: Optional[str] = None
    data: Optional[Any] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# Forward reference resolution
CaseResponse.model_rebuild()
