"""API endpoints for case actions (human-in-the-loop)."""

from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.case import ACIPCase, CaseStatus
from app.models.action import CaseAction, ActionType
from app.schemas.case import ActionCreate, ActionResponse, CaseResponse
from app.services.workflow import ACIPWorkflow
from app.core.audit import AuditService
from app.api.websocket import manager

router = APIRouter(prefix="/api/cases/{case_id}/actions", tags=["actions"])


# ============== Background Task for Resuming Workflow ==============

async def resume_workflow_task(case_id: str, decision: str, actor: str, notes: str):
    """Background task to resume the workflow after human input."""
    workflow = ACIPWorkflow()
    result = workflow.resume_with_human_input(
        case_id=case_id,
        decision=decision,
        actor=actor,
        notes=notes
    )
    
    # Broadcast update
    await manager.broadcast({
        "type": "case_update",
        "case_id": case_id,
        "status": result.get("status"),
        "decision": decision,
        "actor": actor,
        "timestamp": datetime.utcnow().isoformat()
    })


# ============== Endpoints ==============

@router.post("", response_model=ActionResponse)
async def perform_action(
    case_id: UUID,
    action: ActionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Perform a human-in-the-loop action on a case.
    
    Available actions:
    - approve: Approve the ACIP case
    - reject: Reject the ACIP case
    - escalate: Escalate to a senior reviewer
    - request_docs: Request additional documents
    - manual_override: Override extracted data
    - add_note: Add a note without changing status
    - assign: Assign to a specific operator
    """
    # Get case
    result = await db.execute(
        select(ACIPCase).where(ACIPCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Validate action based on current status
    if action.action_type == ActionType.APPROVE:
        # Allow approve from more statuses - user should be able to approve at any point (except already approved/rejected)
        if case.status in [CaseStatus.APPROVED, CaseStatus.REJECTED]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot approve case in status: {case.status.value}"
            )
        # Require notes for approval (AUSTRAC compliance)
        if not action.notes or not action.notes.strip():
            raise HTTPException(
                status_code=400,
                detail="Approval notes are required for AUSTRAC compliance"
            )
    
    if action.action_type == ActionType.REJECT:
        # Allow reject from more statuses - user should be able to reject at any point
        if case.status in [CaseStatus.APPROVED, CaseStatus.REJECTED]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot reject case in status: {case.status.value}"
            )
        # Require notes for rejection (AUSTRAC compliance - need reason)
        if not action.notes or not action.notes.strip():
            raise HTTPException(
                status_code=400,
                detail="Rejection reason/notes are required for AUSTRAC compliance"
            )
    
    # Store previous status
    previous_status = case.status.value
    
    # Determine new status
    status_map = {
        ActionType.APPROVE: CaseStatus.APPROVED,
        ActionType.REJECT: CaseStatus.REJECTED,
        ActionType.ESCALATE: CaseStatus.ESCALATED,
        ActionType.REQUEST_DOCS: CaseStatus.DOCS_REQUESTED,
    }
    
    new_status = status_map.get(action.action_type)
    
    # Update case if status changes
    if new_status:
        case.status = new_status
        if new_status in [CaseStatus.APPROVED, CaseStatus.REJECTED]:
            case.completed_at = datetime.utcnow()
        if new_status == CaseStatus.ESCALATED and action.escalated_to:
            case.escalated_to = action.escalated_to
        if new_status == CaseStatus.REJECTED and action.notes:
            case.rejection_reason = action.notes
        
        # If approved, generate AUSTRAC report (will be shown to user via API)
        # Report generation happens on-demand via /cases/{case_id}/report endpoint
        # This ensures the report includes the latest approval notes
    
    # Handle manual override
    if action.action_type == ActionType.MANUAL_OVERRIDE and action.override_data:
        if case.extracted_data:
            case.extracted_data.update(action.override_data)
        else:
            case.extracted_data = action.override_data
    
    # Handle assignment
    if action.action_type == ActionType.ASSIGN and action.notes:
        case.assigned_to = action.notes
    
    # Create action record
    case_action = CaseAction(
        case_id=case_id,
        action_type=action.action_type,
        performed_by=action.performed_by,
        notes=action.notes,
        previous_status=previous_status,
        new_status=new_status.value if new_status else None,
        escalated_to=action.escalated_to,
        requested_documents=action.requested_documents
    )
    
    db.add(case_action)
    case.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(case_action)
    
    # Log audit entry
    audit_service = AuditService(db)
    await audit_service.log_step(
        case_id=case_id,
        step_name=f"Action: {action.action_type.value}",
        details=f"{action.performed_by} performed {action.action_type.value}. Notes: {action.notes or 'None'}",
        performed_by=action.performed_by
    )
    
    # Resume workflow if needed
    if action.action_type in [ActionType.APPROVE, ActionType.REJECT, ActionType.ESCALATE]:
        background_tasks.add_task(
            resume_workflow_task,
            str(case_id),
            action.action_type.value,
            action.performed_by,
            action.notes or ""
        )
    
    # Broadcast action
    await manager.broadcast({
        "type": "action_taken",
        "case_id": str(case_id),
        "action_type": action.action_type.value,
        "performed_by": action.performed_by,
        "new_status": new_status.value if new_status else None,
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return ActionResponse(**case_action.to_dict())


@router.get("", response_model=list[ActionResponse])
async def list_actions(
    case_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get all actions taken on a case."""
    result = await db.execute(
        select(CaseAction)
        .where(CaseAction.case_id == case_id)
        .order_by(CaseAction.created_at.desc())
    )
    actions = result.scalars().all()
    
    return [ActionResponse(**a.to_dict()) for a in actions]


@router.post("/bulk-approve")
async def bulk_approve_cases(
    case_ids: list[UUID],
    performed_by: str,
    notes: str = None,
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db)
):
    """Bulk approve multiple cases (for low-risk batch processing)."""
    approved = []
    failed = []
    
    for case_id in case_ids:
        try:
            result = await db.execute(
                select(ACIPCase).where(ACIPCase.id == case_id)
            )
            case = result.scalar_one_or_none()
            
            if not case:
                failed.append({"case_id": str(case_id), "reason": "Not found"})
                continue
            
            if case.status not in [CaseStatus.AWAITING_HUMAN, CaseStatus.ESCALATED]:
                failed.append({
                    "case_id": str(case_id),
                    "reason": f"Invalid status: {case.status.value}"
                })
                continue
            
            # Update case
            previous_status = case.status.value
            case.status = CaseStatus.APPROVED
            case.completed_at = datetime.utcnow()
            case.updated_at = datetime.utcnow()
            
            # Create action record
            action = CaseAction(
                case_id=case_id,
                action_type=ActionType.APPROVE,
                performed_by=performed_by,
                notes=notes or "Bulk approval",
                previous_status=previous_status,
                new_status=CaseStatus.APPROVED.value
            )
            db.add(action)
            
            approved.append(str(case_id))
            
        except Exception as e:
            failed.append({"case_id": str(case_id), "reason": str(e)})
    
    await db.commit()
    
    # Broadcast bulk update
    await manager.broadcast({
        "type": "bulk_action",
        "action": "approve",
        "case_ids": approved,
        "performed_by": performed_by,
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return {
        "approved": approved,
        "failed": failed,
        "total_approved": len(approved),
        "total_failed": len(failed)
    }
