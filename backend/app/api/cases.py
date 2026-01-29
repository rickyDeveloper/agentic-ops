"""API endpoints for ACIP cases."""

import os
import shutil
from uuid import UUID
from typing import Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.database import get_db
from app.models.case import ACIPCase, CaseStatus, RiskLevel
from app.schemas.case import (
    CaseCreate, 
    CaseUpdate, 
    CaseResponse, 
    CaseListResponse,
    AuditLogResponse
)
from app.services.workflow import ACIPWorkflow
from app.services.agents import activity_logger
from app.core.audit import AuditService
from app.config import get_settings
from app.api.websocket import manager
from app.api.customers import load_customers

settings = get_settings()
router = APIRouter(prefix="/api/cases", tags=["cases"])

# Wire up activity logger to broadcast via WebSocket
activity_logger.set_broadcast_callback(manager.broadcast)


# ============== Background Task for Workflow ==============

async def process_case_workflow(
    case_id: str, 
    document_path: str, 
    customer_name: str, 
    customer_email: Optional[str],
    customer_id: Optional[str] = None
):
    """Background task to run the ACIP workflow with three specialized agents."""
    from app.database import AsyncSessionLocal
    
    print(f"\n{'#'*60}")
    print(f"#")
    print(f"#  ACIP AGENTIC VERIFICATION SYSTEM")
    print(f"#  ================================")
    print(f"#")
    print(f"#  Case ID: {case_id}")
    print(f"#  Customer: {customer_name}")
    print(f"#  Document: {os.path.basename(document_path)}")
    print(f"#")
    print(f"#  Three AI Agents will now process this case:")
    print(f"#  1. Document Inspector - OCR/Vision extraction")
    print(f"#  2. External Verifier - DVS, PEP, Sanctions")
    print(f"#  3. Compliance Officer - Risk assessment")
    print(f"#")
    print(f"{'#'*60}\n")
    
    # Broadcast workflow started
    await manager.broadcast({
        "type": "workflow_started",
        "case_id": case_id,
        "customer_name": customer_name,
        "message": "ACIP agentic verification initiated - 3 AI agents processing",
        "timestamp": datetime.utcnow().isoformat()
    })
    
    # Load customer data from database for verification
    customer_db_data = None
    if customer_id:
        try:
            customers = load_customers()
            for customer in customers:
                if customer.get("customer_id") == customer_id:
                    customer_db_data = customer
                    print(f"[SYSTEM] Loaded customer database record: {customer_id}")
                    break
        except Exception as e:
            print(f"[SYSTEM] Warning: Could not load customer data: {e}")
    
    try:
        workflow = ACIPWorkflow()
        result = workflow.start_case(
            case_id=case_id,
            customer_name=customer_name,
            document_path=document_path,
            customer_email=customer_email,
            customer_db_data=customer_db_data
        )
        
        # Get compliance decision details
        compliance_result = result.get("compliance_result", {})
        final_decision = result.get("final_decision", "ESCALATE")
        
        print(f"\n{'#'*60}")
        print(f"#")
        print(f"#  WORKFLOW COMPLETE")
        print(f"#  =================")
        print(f"#  Case: {case_id}")
        print(f"#  Status: {result.get('status')}")
        print(f"#  Risk Level: {result.get('risk_level', 'unknown').upper()}")
        print(f"#  AI Decision: {final_decision}")
        print(f"#")
        print(f"{'#'*60}\n")
        
        # Update the case in the database with workflow results
        async with AsyncSessionLocal() as db:
            stmt = select(ACIPCase).where(ACIPCase.id == case_id)
            db_result = await db.execute(stmt)
            case = db_result.scalar_one_or_none()
            
            if case:
                # Update case with comprehensive workflow results
                # Try multiple sources for extracted data
                extracted_data = None
                if result.get("extraction_result"):
                    extracted_data = result.get("extraction_result")
                elif result.get("inspection_result") and result.get("inspection_result", {}).get("extracted_data"):
                    extracted_data = result.get("inspection_result", {}).get("extracted_data")
                
                if extracted_data:
                    case.extracted_data = extracted_data
                    print(f"[API] Saved extracted_data to case {case_id}: {list(extracted_data.keys())}")
                else:
                    # Try one more time - check if inspection_result has the data
                    inspection_result = result.get("inspection_result", {})
                    if isinstance(inspection_result, dict) and inspection_result.get("extracted_data"):
                        extracted_data = inspection_result.get("extracted_data")
                        case.extracted_data = extracted_data
                        print(f"[API] Saved extracted_data from inspection_result.extracted_data for case {case_id}: {list(extracted_data.keys())}")
                    else:
                        print(f"[API] Warning: No extracted_data found in workflow result for case {case_id}")
                        print(f"[API] Workflow result keys: {list(result.keys())}")
                        if result.get("inspection_result"):
                            print(f"[API] Inspection result keys: {list(result.get('inspection_result', {}).keys())}")
                            if isinstance(result.get("inspection_result"), dict):
                                print(f"[API] Inspection result has extracted_data: {result.get('inspection_result', {}).get('extracted_data') is not None}")
                
                # Store full verification result including all checks
                verification_data = result.get("verification_result", {})
                if verification_data:
                    case.verification_result = {
                        "overall_status": verification_data.get("overall_status"),
                        "dvs_verified": verification_data.get("dvs_result", {}).get("verified", False),
                        "pep_clear": not verification_data.get("pep_result", {}).get("is_pep", False),
                        "sanctions_clear": not verification_data.get("sanctions_result", {}).get("is_sanctioned", False),
                        "database_match": verification_data.get("database_match", {}).get("status"),
                        "risk_indicators": verification_data.get("risk_indicators", []),
                        "compliance_result": compliance_result  # Store compliance result for report generation
                    }
                
                # Set risk level
                if result.get("risk_level"):
                    try:
                        case.risk_level = RiskLevel(result.get("risk_level").upper())
                    except ValueError:
                        case.risk_level = RiskLevel.UNKNOWN
                
                # Set AI confidence score and decision
                if compliance_result.get("confidence_score"):
                    case.ai_confidence_score = compliance_result.get("confidence_score")
                
                # Store the AI decision
                case.ai_decision = final_decision
                
                # Also store inspection_result for reference (contains full extraction details)
                if result.get("inspection_result") and not case.extracted_data:
                    # If we still don't have extracted_data, try to get it from inspection_result
                    inspection_data = result.get("inspection_result", {}).get("extracted_data")
                    if inspection_data:
                        case.extracted_data = inspection_data
                        print(f"[API] Saved extracted_data from inspection_result for case {case_id}")
                
                # Ensure we also log extracted_data to audit log if not already there
                if case.extracted_data:
                    from app.core.audit import AuditService
                    from app.models.audit import AuditLog
                    audit_service = AuditService(db)
                    # Check if we already have an audit log with extracted_data
                    existing_audit_result = await db.execute(
                        select(AuditLog)
                        .where(AuditLog.case_id == case_id)
                        .where(AuditLog.extracted_data.isnot(None))
                        .limit(1)
                    )
                    if not existing_audit_result.scalar_one_or_none():
                        # Log extracted data to audit trail
                        await audit_service.log_step(
                            case_id=case_id,
                            step_name="Document Extraction",
                            details="Extracted data from document",
                            extracted_data=case.extracted_data,
                            performed_by="system"
                        )
                        print(f"[API] Logged extracted_data to audit log for case {case_id}")
                
                # Map workflow status to case status
                workflow_status = result.get("status", "pending")
                status_map = {
                    "awaiting_human": CaseStatus.AWAITING_HUMAN,
                    "verified": CaseStatus.VERIFIED,
                    "approved": CaseStatus.APPROVED,
                    "rejected": CaseStatus.REJECTED,
                    "ai_review": CaseStatus.AI_REVIEW,
                    "pending": CaseStatus.PENDING,
                    "processing": CaseStatus.PROCESSING,
                    "escalated": CaseStatus.ESCALATED
                }
                case.status = status_map.get(workflow_status, CaseStatus.AWAITING_HUMAN)
                
                await db.commit()
                await db.refresh(case)
                
                # Verify extracted_data was saved
                if case.extracted_data:
                    print(f"[API] Verified extracted_data saved to case {case_id}: {list(case.extracted_data.keys())}")
                else:
                    print(f"[API] WARNING: extracted_data is still None after save for case {case_id}")
                
                print(f"[DATABASE] Updated case {case_id}")
                print(f"  - Status: {case.status.value}")
                print(f"  - Risk Level: {case.risk_level.value}")
                print(f"  - AI Confidence: {case.ai_confidence_score or 'N/A'}")
        
        # Build workflow complete message
        decision_messages = {
            "APPROVE": "AI has approved this case - account restrictions can be lifted",
            "REJECT": "AI has rejected this case - requires compliance review",
            "ESCALATE": "AI has escalated for human review - manual verification required"
        }
        
        # Broadcast comprehensive update to connected clients
        await manager.broadcast({
            "type": "workflow_complete",
            "case_id": case_id,
            "customer_name": customer_name,
            "status": result.get("status"),
            "risk_level": result.get("risk_level"),
            "ai_decision": final_decision,
            "confidence_score": compliance_result.get("confidence_score"),
            "reasoning": compliance_result.get("reasoning"),
            "message": decision_messages.get(final_decision, "Workflow completed"),
            "inspection_success": result.get("inspection_result", {}).get("success", False),
            "verification_status": result.get("verification_result", {}).get("overall_status"),
            "timestamp": datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"\n[ERROR] Workflow failed for case {case_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Broadcast error
        await manager.broadcast({
            "type": "workflow_error",
            "case_id": case_id,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        })


# ============== Endpoints ==============

@router.post("", response_model=CaseResponse)
async def create_case(
    background_tasks: BackgroundTasks,
    customer_id: str = Form(...),
    notes: Optional[str] = Form(None),
    document: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new ACIP case for an existing customer.
    
    The document is uploaded and the agentic workflow verifies
    it against the customer's data in the database.
    """
    # Load customer from database
    from app.api.customers import load_customers
    customers = load_customers()
    customer = next((c for c in customers if c.get("customer_id") == customer_id), None)
    
    if not customer:
        raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
    
    customer_name = f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip()
    
    # Save uploaded document
    os.makedirs(settings.documents_dir, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{customer_id}_{document.filename.replace(' ', '_')}"
    document_path = os.path.join(settings.documents_dir, safe_filename)
    
    with open(document_path, "wb") as f:
        content = await document.read()
        f.write(content)
    
    # Create case record
    case = ACIPCase(
        customer_name=customer_name,
        customer_email=customer.get("email"),
        customer_phone=customer.get("phone"),
        document_path=document_path,
        notes=f"Customer ID: {customer_id}\n{notes or ''}".strip(),
        status=CaseStatus.PENDING
    )
    
    db.add(case)
    await db.commit()
    await db.refresh(case)
    
    # Log audit entry
    audit_service = AuditService(db)
    await audit_service.log_step(
        case_id=case.id,
        step_name="Case Created",
        details=f"ACIP case created for {customer_name}",
        document_path=document_path,
        performed_by="system"
    )
    
    # Start workflow in background with all customer data
    background_tasks.add_task(
        process_case_workflow,
        str(case.id),
        document_path,
        customer_name,
        customer.get("email"),
        customer_id  # Pass customer_id for database verification
    )
    
    # Broadcast new case
    await manager.broadcast({
        "type": "new_case",
        "case_id": str(case.id),
        "customer_name": customer_name,
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return CaseResponse(**case.to_dict())


@router.get("/documents", response_model=list)
async def list_available_documents():
    """
    List existing documents in the documents folder.
    These can be used for demo/testing without uploading.
    """
    documents = []
    docs_dir = settings.documents_dir
    
    if os.path.exists(docs_dir):
        for filename in os.listdir(docs_dir):
            if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                # Skip timestamped uploaded files (they have format like 20260129_...)
                if not filename[:8].isdigit():
                    filepath = os.path.join(docs_dir, filename)
                    documents.append({
                        "filename": filename,
                        "path": filepath,
                        "size": os.path.getsize(filepath)
                    })
    
    return sorted(documents, key=lambda x: x["filename"])


@router.post("/with-existing-doc", response_model=CaseResponse)
async def create_case_with_existing_document(
    background_tasks: BackgroundTasks,
    customer_id: str = Form(...),
    document_filename: str = Form(...),
    notes: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new ACIP case using an existing document from the documents folder.
    
    This is useful for demo/testing to properly test match/mismatch scenarios:
    - Select Craig Menon + craig_license.png = MATCH
    - Select Craig Menon + jane_passport.png = NO_MATCH (wrong document)
    """
    # Load customer from database
    from app.api.customers import load_customers
    customers = load_customers()
    customer = next((c for c in customers if c.get("customer_id") == customer_id), None)
    
    if not customer:
        raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
    
    # Verify document exists
    document_path = os.path.join(settings.documents_dir, document_filename)
    if not os.path.exists(document_path):
        raise HTTPException(status_code=404, detail=f"Document {document_filename} not found")
    
    customer_name = f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip()
    
    # Create case record
    case = ACIPCase(
        customer_name=customer_name,
        customer_email=customer.get("email"),
        customer_phone=customer.get("phone"),
        document_path=document_path,
        notes=f"Customer ID: {customer_id}\nUsing existing doc: {document_filename}\n{notes or ''}".strip(),
        status=CaseStatus.PENDING
    )
    
    db.add(case)
    await db.commit()
    await db.refresh(case)
    
    # Log audit entry
    audit_service = AuditService(db)
    await audit_service.log_step(
        case_id=case.id,
        step_name="Case Created",
        details=f"ACIP case created for {customer_name} using existing document: {document_filename}",
        document_path=document_path,
        performed_by="system"
    )
    
    # Start workflow in background
    background_tasks.add_task(
        process_case_workflow,
        str(case.id),
        document_path,
        customer_name,
        customer.get("email"),
        customer_id
    )
    
    # Broadcast new case
    await manager.broadcast({
        "type": "new_case",
        "case_id": str(case.id),
        "customer_name": customer_name,
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return CaseResponse(**case.to_dict())


@router.get("", response_model=CaseListResponse)
async def list_cases(
    status: Optional[CaseStatus] = Query(None),
    risk_level: Optional[RiskLevel] = Query(None),
    search: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    List ACIP cases with filtering and pagination.
    """
    query = select(ACIPCase)
    count_query = select(func.count(ACIPCase.id))
    
    # Apply filters
    if status:
        query = query.where(ACIPCase.status == status)
        count_query = count_query.where(ACIPCase.status == status)
    
    if risk_level:
        query = query.where(ACIPCase.risk_level == risk_level)
        count_query = count_query.where(ACIPCase.risk_level == risk_level)
    
    if search:
        search_filter = or_(
            ACIPCase.customer_name.ilike(f"%{search}%"),
            ACIPCase.customer_email.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    
    if overdue_only:
        now = datetime.utcnow()
        query = query.where(
            ACIPCase.deadline_at < now,
            ACIPCase.status.notin_([
                CaseStatus.APPROVED,
                CaseStatus.REJECTED,
                CaseStatus.VERIFIED
            ])
        )
        count_query = count_query.where(
            ACIPCase.deadline_at < now,
            ACIPCase.status.notin_([
                CaseStatus.APPROVED,
                CaseStatus.REJECTED,
                CaseStatus.VERIFIED
            ])
        )
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.order_by(ACIPCase.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    cases = result.scalars().all()
    
    return CaseListResponse(
        cases=[CaseResponse(**c.to_dict()) for c in cases],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )


@router.get("/stats")
async def get_case_stats(db: AsyncSession = Depends(get_db)):
    """Get dashboard statistics for ACIP cases."""
    now = datetime.utcnow()
    
    # Total by status
    status_query = select(
        ACIPCase.status,
        func.count(ACIPCase.id)
    ).group_by(ACIPCase.status)
    status_result = await db.execute(status_query)
    status_counts = {row[0].value: row[1] for row in status_result}
    
    # Overdue count
    overdue_query = select(func.count(ACIPCase.id)).where(
        ACIPCase.deadline_at < now,
        ACIPCase.status.notin_([
            CaseStatus.APPROVED,
            CaseStatus.REJECTED,
            CaseStatus.VERIFIED
        ])
    )
    overdue_result = await db.execute(overdue_query)
    overdue_count = overdue_result.scalar()
    
    # Awaiting human review
    awaiting_human = status_counts.get("awaiting_human", 0) + \
                     status_counts.get("escalated", 0)
    
    return {
        "total_pending": status_counts.get("pending", 0),
        "total_processing": status_counts.get("processing", 0),
        "awaiting_human_review": awaiting_human,
        "total_approved": status_counts.get("approved", 0) + status_counts.get("verified", 0),
        "total_rejected": status_counts.get("rejected", 0),
        "docs_requested": status_counts.get("docs_requested", 0),
        "overdue_cases": overdue_count,
        "status_breakdown": status_counts
    }


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(
    case_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get details of a specific ACIP case."""
    result = await db.execute(
        select(ACIPCase).where(ACIPCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dict = case.to_dict()
    
    # If extracted_data is missing, try to get it from audit logs
    if not case_dict.get("extracted_data") or not case_dict["extracted_data"]:
        from app.models.audit import AuditLog
        audit_result = await db.execute(
            select(AuditLog)
            .where(AuditLog.case_id == case_id)
            .where(AuditLog.extracted_data.isnot(None))
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
        audit_log = audit_result.scalar_one_or_none()
        if audit_log and audit_log.extracted_data:
            case_dict["extracted_data"] = audit_log.extracted_data
            print(f"[API] Loaded extracted_data from audit log for case {case_id}")
            # Also update the case record for future requests
            case.extracted_data = audit_log.extracted_data
            await db.commit()
            await db.refresh(case)
        else:
            # Try to get from inspection_result in verification_result
            if case.verification_result and isinstance(case.verification_result, dict):
                inspection_result = case.verification_result.get("inspection_result")
                if inspection_result and isinstance(inspection_result, dict):
                    extracted_from_inspection = inspection_result.get("extracted_data")
                    if extracted_from_inspection:
                        case_dict["extracted_data"] = extracted_from_inspection
                        case.extracted_data = extracted_from_inspection
                        await db.commit()
                        await db.refresh(case)
                        print(f"[API] Loaded extracted_data from verification_result.inspection_result for case {case_id}")
    
    # Extract customer_id from notes and load customer database data
    customer_id = None
    if case.notes:
        import re
        match = re.search(r'Customer ID:\s*([A-Z0-9-]+)', case.notes)
        if match:
            customer_id = match.group(1)
    
    # Load customer data from database if customer_id found
    if customer_id:
        try:
            customers = load_customers()
            customer_db_data = next((c for c in customers if c.get("customer_id") == customer_id), None)
            if customer_db_data:
                # Add customer database data to verification_result for frontend display
                if not case_dict.get("verification_result"):
                    case_dict["verification_result"] = {}
                if "database_record" not in case_dict["verification_result"]:
                    case_dict["verification_result"]["database_record"] = customer_db_data
        except Exception as e:
            print(f"[API] Warning: Could not load customer data: {e}")
    
    return CaseResponse(**case_dict)


@router.patch("/{case_id}", response_model=CaseResponse)
async def update_case(
    case_id: UUID,
    update: CaseUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an ACIP case (limited fields)."""
    result = await db.execute(
        select(ACIPCase).where(ACIPCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(case, field, value)
    
    case.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(case)
    
    return CaseResponse(**case.to_dict())


@router.get("/{case_id}/audit", response_model=list[AuditLogResponse])
async def get_case_audit_trail(
    case_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get the audit trail for an ACIP case."""
    audit_service = AuditService(db)
    logs = await audit_service.get_audit_trail(case_id)
    
    return [AuditLogResponse(**log.to_dict()) for log in logs]


@router.get("/{case_id}/activities")
async def get_case_activities(case_id: UUID):
    """Get the real-time agent activities for an ACIP case."""
    activities = activity_logger.get_activities(str(case_id))
    return {
        "case_id": str(case_id),
        "activities": [a.to_dict() for a in activities],
        "total": len(activities)
    }


@router.get("/{case_id}/document")
async def get_case_document(
    case_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get the document associated with a case."""
    from fastapi.responses import FileResponse
    
    result = await db.execute(
        select(ACIPCase).where(ACIPCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if not case.document_path or not os.path.exists(case.document_path):
        raise HTTPException(status_code=404, detail="Document not found")
    
    return FileResponse(case.document_path)


@router.get("/{case_id}/report")
async def generate_acip_report(
    case_id: UUID,
    db: AsyncSession = Depends(get_db),
    format: Optional[str] = Query("text", description="Report format: 'text' or 'json'")
):
    """
    Generate ACIP audit report with human-in-the-loop notes.
    
    This endpoint generates a comprehensive ACIP report that includes:
    - AI assessment and decision
    - Risk factors and mitigating factors
    - Complete audit trail
    - Human review notes from all user actions
    
    After approval, this report is automatically generated and can be viewed/downloaded.
    """
    from fastapi.responses import Response, JSONResponse
    from app.models.action import CaseAction
    from app.services.agents.compliance_officer import ComplianceOfficerAgent
    
    # Get case
    result = await db.execute(
        select(ACIPCase).where(ACIPCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Get all user actions with notes
    actions_result = await db.execute(
        select(CaseAction)
        .where(CaseAction.case_id == case_id)
        .order_by(CaseAction.created_at.asc())
    )
    actions = actions_result.scalars().all()
    
    # Convert actions to dict format
    user_actions = [action.to_dict() for action in actions]
    
    # Get compliance result - check if stored in verification_result or create from case data
    compliance_result = {}
    
    # Try to extract compliance data from verification_result if available
    if case.verification_result and isinstance(case.verification_result, dict):
        # Check if compliance_result is nested in verification_result
        if "compliance_result" in case.verification_result:
            compliance_result = case.verification_result.get("compliance_result", {})
        else:
            # Use verification_result data to build compliance result
            compliance_result = {
                "decision": case.ai_decision or (case.status.value.upper() if case.status else "PENDING"),
                "risk_level": case.risk_level.value.upper() if case.risk_level else "MEDIUM",
                "confidence_score": float(case.ai_confidence_score) if case.ai_confidence_score else 0.5,
                "reasoning": f"Verification status: {case.verification_result.get('overall_status', 'UNKNOWN')}",
                "risk_factors": case.verification_result.get("risk_indicators", []),
                "mitigating_factors": [],
                "next_steps": f"Case status: {case.status.value if case.status else 'Unknown'}",
                "audit_trail": []
            }
    
    # If no compliance result exists, create a comprehensive one from case data
    if not compliance_result:
        # Extract risk factors from verification result if available
        risk_factors = []
        mitigating_factors = []
        
        if case.verification_result and isinstance(case.verification_result, dict):
            if not case.verification_result.get("dvs_verified", True):
                risk_factors.append("DVS verification failed")
            else:
                mitigating_factors.append("DVS verified")
            
            if not case.verification_result.get("pep_clear", True):
                risk_factors.append("PEP status identified")
            else:
                mitigating_factors.append("No PEP associations")
            
            if not case.verification_result.get("sanctions_clear", True):
                risk_factors.append("SANCTIONS HIT")
            else:
                mitigating_factors.append("Cleared all sanctions lists")
            
            db_match = case.verification_result.get("database_match")
            if db_match == "VERIFIED":
                mitigating_factors.append("Customer database match confirmed")
            elif db_match == "DISCREPANCY":
                risk_factors.append("Database discrepancies found")
        
        # Build reasoning based on status
        if case.status == CaseStatus.APPROVED:
            reasoning = "Case approved by human reviewer after comprehensive verification"
        elif case.status == CaseStatus.REJECTED:
            reasoning = case.rejection_reason or "Case rejected by human reviewer"
        else:
            reasoning = f"Case status: {case.status.value if case.status else 'Unknown'}. Report generated from available data."
        
        compliance_result = {
            "decision": case.ai_decision or (case.status.value.upper() if case.status else "PENDING"),
            "risk_level": case.risk_level.value.upper() if case.risk_level else "MEDIUM",
            "confidence_score": float(case.ai_confidence_score) if case.ai_confidence_score else 0.5,
            "reasoning": reasoning,
            "risk_factors": risk_factors,
            "mitigating_factors": mitigating_factors,
            "next_steps": f"Case status: {case.status.value if case.status else 'Unknown'}",
            "audit_trail": []
        }
    
    # Generate report with user notes
    compliance_agent = ComplianceOfficerAgent()
    report_text = compliance_agent.generate_audit_report(
        case_id=str(case_id),
        assessment_result=compliance_result,
        user_actions=user_actions
    )
    
    # Return as JSON if requested, otherwise text
    if format == "json":
        return JSONResponse({
            "case_id": str(case_id),
            "customer_name": case.customer_name,
            "status": case.status.value,
            "report": report_text,
            "generated_at": datetime.utcnow().isoformat()
        })
    
    # Return as text/plain response
    return Response(
        content=report_text,
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="acip_report_{case_id}.txt"'
        }
    )
