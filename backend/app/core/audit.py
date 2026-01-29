"""Audit service for logging ACIP workflow steps to database."""

import os
import shutil
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog
from app.config import get_settings

settings = get_settings()


class AuditService:
    """
    Service for managing audit logs.
    
    Per AUSTRAC requirements, all steps in the ACIP process
    must be fully documented and auditable.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def log_step(
        self,
        case_id: UUID,
        step_name: str,
        details: Optional[str] = None,
        extracted_data: Optional[Dict] = None,
        verification_result: Optional[Dict] = None,
        langgraph_node: Optional[str] = None,
        langgraph_state: Optional[Dict] = None,
        document_path: Optional[str] = None,
        performed_by: str = "system"
    ) -> AuditLog:
        """
        Log a step in the ACIP workflow.
        
        Args:
            case_id: The ACIP case ID
            step_name: Name of the step (e.g., "extraction", "verification")
            details: Human-readable description
            extracted_data: Snapshot of extracted data at this step
            verification_result: Snapshot of verification result
            langgraph_node: The LangGraph node that was executed
            langgraph_state: Snapshot of LangGraph state
            document_path: Path to related document
            performed_by: "system", "ai", or username
            
        Returns:
            The created AuditLog entry
        """
        # Copy document to audit directory if provided
        screenshot_path = None
        if document_path and os.path.exists(document_path):
            audit_dir = os.path.join(
                settings.audit_logs_dir,
                str(case_id)
            )
            os.makedirs(audit_dir, exist_ok=True)
            
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = f"{timestamp}_{os.path.basename(document_path)}"
            screenshot_path = os.path.join(audit_dir, filename)
            shutil.copy2(document_path, screenshot_path)
        
        audit_log = AuditLog(
            case_id=case_id,
            step_name=step_name,
            details=details,
            extracted_data=extracted_data,
            verification_result=verification_result,
            langgraph_node=langgraph_node,
            langgraph_state=langgraph_state,
            screenshot_path=screenshot_path,
            document_path=document_path,
            performed_by=performed_by
        )
        
        self.db.add(audit_log)
        await self.db.commit()
        await self.db.refresh(audit_log)
        
        return audit_log
    
    async def get_audit_trail(self, case_id: UUID) -> list[AuditLog]:
        """Get all audit logs for a case, ordered by timestamp."""
        from sqlalchemy import select
        
        result = await self.db.execute(
            select(AuditLog)
            .where(AuditLog.case_id == case_id)
            .order_by(AuditLog.created_at)
        )
        return result.scalars().all()
