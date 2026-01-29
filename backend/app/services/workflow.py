"""
ACIP Workflow using LangGraph with Three Specialized Agents

This implements the AUSTRAC-compliant ACIP workflow with:
- Document Inspector Agent: Vision/OCR extraction
- External Verifier Agent: DVS, PEP, Sanctions checks
- Compliance Officer Agent: Risk assessment and decisioning
- Human-in-the-loop (HITL) interrupt points
- Comprehensive audit logging with real-time updates
"""

import os
import uuid
import json
from typing import TypedDict, Literal, Optional, Annotated, Any, Dict
from datetime import datetime
from langgraph.graph import StateGraph, END
from langgraph.types import interrupt, Command
from app.config import get_settings
from app.services.agents import (
    DocumentInspectorAgent,
    ExternalVerifierAgent,
    ComplianceOfficerAgent,
    activity_logger,
    AgentType,
    ActivityStatus
)

settings = get_settings()


# ============== State Definition ==============

class WorkflowState(TypedDict):
    """State schema for the ACIP workflow."""
    # Case identification
    case_id: str
    thread_id: str
    
    # Input data
    customer_name: str
    customer_email: Optional[str]
    document_path: str
    customer_db_data: Optional[Dict[str, Any]]  # Pre-loaded customer data from DB
    
    # Processing status
    status: str
    risk_level: str
    
    # Agent results
    inspection_result: Optional[Dict[str, Any]]
    verification_result: Optional[Dict[str, Any]]
    compliance_result: Optional[Dict[str, Any]]
    
    # Legacy fields for compatibility
    extraction_result: Optional[Dict[str, Any]]
    extraction_error: Optional[str]
    review_result: Optional[Dict[str, Any]]
    
    # Human-in-the-loop
    human_decision: Optional[str]
    human_notes: Optional[str]
    human_actor: Optional[str]
    
    # Final outcome
    final_status: Optional[str]
    final_decision: Optional[str]
    completion_time: Optional[str]
    
    # Audit trail
    audit_trail: list


# ============== Workflow Nodes ==============

def start_workflow(state: WorkflowState) -> WorkflowState:
    """Initialize the workflow"""
    case_id = state.get("case_id", "unknown")
    
    activity_logger.log(
        case_id=case_id,
        agent=AgentType.SYSTEM,
        action="ACIP Workflow Initiated",
        details=f"Starting verification for {state.get('customer_name')}",
        status=ActivityStatus.STARTED,
        data={
            "customer_name": state.get("customer_name"),
            "document": os.path.basename(state.get("document_path", ""))
        }
    )
    
    return {
        **state,
        "status": "processing",
        "audit_trail": state.get("audit_trail", []) + [{
            "step": "workflow_started",
            "timestamp": datetime.utcnow().isoformat(),
            "details": "ACIP verification workflow initiated"
        }]
    }


def document_inspection_node(state: WorkflowState) -> WorkflowState:
    """
    Node: Document Inspector Agent
    
    Extracts and validates data from the ID document.
    """
    case_id = state.get("case_id", "unknown")
    document_path = state.get("document_path", "")
    customer_db_data = state.get("customer_db_data")
    
    print(f"\n{'='*60}")
    print(f"  PHASE 1: DOCUMENT INSPECTION")
    print(f"  Case: {case_id}")
    print(f"{'='*60}\n")
    
    agent = DocumentInspectorAgent()
    result = agent.inspect(case_id, document_path, customer_db_data=customer_db_data)
    
    # Map to legacy fields for compatibility
    extraction_result = result.get("extracted_data")
    
    audit_entry = {
        "step": "document_inspection",
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "Document Inspector",
        "success": result.get("success", False),
        "document_type": result.get("document_type"),
        "quality_score": result.get("quality_score"),
        "issues": result.get("issues", [])
    }
    
    return {
        **state,
        "status": "verifying" if result.get("success") else "awaiting_human",
        "inspection_result": result,
        "extraction_result": extraction_result,
        "extraction_error": None if result.get("success") else "Document inspection failed",
        "audit_trail": state.get("audit_trail", []) + [audit_entry]
    }


def external_verification_node(state: WorkflowState) -> WorkflowState:
    """
    Node: External Verifier Agent
    
    Verifies against DVS, PEP, and Sanctions lists.
    """
    case_id = state.get("case_id", "unknown")
    inspection_result = state.get("inspection_result", {})
    
    print(f"\n{'='*60}")
    print(f"  PHASE 2: EXTERNAL VERIFICATION")
    print(f"  Case: {case_id}")
    print(f"{'='*60}\n")
    
    # Skip if document inspection failed
    if not inspection_result.get("success"):
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.EXTERNAL_VERIFIER,
            action="Verification Skipped",
            details="Skipping external checks due to document inspection failure",
            status=ActivityStatus.WARNING
        )
        return {
            **state,
            "verification_result": {"overall_status": "SKIPPED", "reason": "Document inspection failed"}
        }
    
    extracted_data = inspection_result.get("extracted_data", {})
    customer_db_data = state.get("customer_db_data")
    
    agent = ExternalVerifierAgent()
    result = agent.verify(case_id, extracted_data, customer_db_data)
    
    audit_entry = {
        "step": "external_verification",
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "External Verifier",
        "overall_status": result.get("overall_status"),
        "dvs_verified": result.get("dvs_result", {}).get("verified", False),
        "pep_clear": not result.get("pep_result", {}).get("is_pep", False),
        "sanctions_clear": not result.get("sanctions_result", {}).get("is_sanctioned", False),
        "requires_human_review": result.get("requires_human_review", False)
    }
    
    return {
        **state,
        "status": "compliance_review",
        "verification_result": result,
        "audit_trail": state.get("audit_trail", []) + [audit_entry]
    }


def compliance_decision_node(state: WorkflowState) -> WorkflowState:
    """
    Node: Compliance Officer Agent
    
    Makes final ACIP decision based on all gathered evidence.
    """
    case_id = state.get("case_id", "unknown")
    inspection_result = state.get("inspection_result", {})
    verification_result = state.get("verification_result", {})
    
    print(f"\n{'='*60}")
    print(f"  PHASE 3: COMPLIANCE DECISION")
    print(f"  Case: {case_id}")
    print(f"{'='*60}\n")
    
    agent = ComplianceOfficerAgent()
    result = agent.assess(
        case_id=case_id,
        inspection_result=inspection_result,
        verification_result=verification_result,
        customer_info=state.get("customer_db_data")
    )
    
    # Generate audit report
    audit_report = agent.generate_audit_report(case_id, result)
    print(f"\n{audit_report}\n")
    
    # Determine next status based on decision
    # ALWAYS escalate to human review - no auto-approval
    decision = result.get("decision", "ESCALATE")
    risk_level = result.get("risk_level", "MEDIUM")
    
    # All cases go to awaiting_human for HITL review
    if decision == "REJECT":
        next_status = "rejected"
    else:  # ESCALATE or APPROVE - always require human review
        next_status = "awaiting_human"
    
    audit_entry = {
        "step": "compliance_decision",
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "Compliance Officer",
        "decision": decision,
        "risk_level": risk_level,
        "confidence_score": result.get("confidence_score"),
        "reasoning": result.get("reasoning")
    }
    
    return {
        **state,
        "status": next_status,
        "risk_level": risk_level.lower(),
        "compliance_result": result,
        "final_decision": decision,
        "review_result": {"status": decision, "risk_level": risk_level},
        "audit_trail": state.get("audit_trail", []) + [audit_entry]
    }


def human_review_node(state: WorkflowState) -> WorkflowState:
    """
    Node: Human-in-the-loop review point.
    
    This node uses LangGraph's interrupt() to pause execution
    and wait for human input.
    """
    case_id = state.get("case_id", "unknown")
    
    print(f"\n{'='*60}")
    print(f"  HUMAN REVIEW REQUIRED")
    print(f"  Case: {case_id}")
    print(f"{'='*60}\n")
    
    compliance_result = state.get("compliance_result", {})
    verification_result = state.get("verification_result", {})
    
    activity_logger.log(
        case_id=case_id,
        agent=AgentType.SYSTEM,
        action="Human Review Requested",
        details=f"Escalated for human review. Decision: {compliance_result.get('decision', 'N/A')}",
        status=ActivityStatus.DECISION,
        data={
            "decision": compliance_result.get("decision"),
            "risk_level": compliance_result.get("risk_level"),
            "reasoning": compliance_result.get("reasoning")
        }
    )
    
    # Prepare context for human reviewer
    review_context = {
        "case_id": case_id,
        "customer_name": state.get("customer_name"),
        "document_path": state.get("document_path"),
        "inspection_result": state.get("inspection_result"),
        "verification_result": verification_result,
        "compliance_result": compliance_result,
        "risk_level": state.get("risk_level"),
        "ai_recommendation": compliance_result.get("decision"),
        "reasoning": compliance_result.get("reasoning"),
        "risk_factors": compliance_result.get("risk_factors", []),
        "next_steps": compliance_result.get("next_steps")
    }
    
    # Use LangGraph interrupt to pause and wait for human input
    human_response = interrupt(review_context)
    
    # Process human response
    decision = human_response.get("decision", "pending")
    notes = human_response.get("notes", "")
    actor = human_response.get("actor", "unknown")
    
    activity_logger.log(
        case_id=case_id,
        agent=AgentType.SYSTEM,
        action="Human Decision Received",
        details=f"Human decision: {decision} by {actor}",
        status=ActivityStatus.SUCCESS,
        data={"decision": decision, "actor": actor}
    )
    
    audit_entry = {
        "step": "human_review",
        "timestamp": datetime.utcnow().isoformat(),
        "decision": decision,
        "actor": actor,
        "notes": notes
    }
    
    return {
        **state,
        "human_decision": decision,
        "human_notes": notes,
        "human_actor": actor,
        "audit_trail": state.get("audit_trail", []) + [audit_entry]
    }


def finalize_case(state: WorkflowState) -> WorkflowState:
    """
    Node: Finalize the case based on decision.
    """
    case_id = state.get("case_id", "unknown")
    decision = state.get("human_decision") or state.get("final_decision", "pending")
    
    # Map decision to final status
    status_map = {
        "approve": "approved",
        "approved": "approved",
        "APPROVE": "approved",
        "reject": "rejected",
        "rejected": "rejected",
        "REJECT": "rejected",
        "escalate": "escalated",
        "ESCALATE": "escalated"
    }
    
    final_status = status_map.get(decision, state.get("status", "pending"))
    
    activity_logger.log(
        case_id=case_id,
        agent=AgentType.SYSTEM,
        action="ACIP Verification Complete",
        details=f"Final status: {final_status.upper()}",
        status=ActivityStatus.SUCCESS,
        data={"final_status": final_status}
    )
    
    return {
        **state,
        "status": final_status,
        "final_status": final_status,
        "completion_time": datetime.utcnow().isoformat(),
        "audit_trail": state.get("audit_trail", []) + [{
            "step": "workflow_completed",
            "timestamp": datetime.utcnow().isoformat(),
            "final_status": final_status
        }]
    }


# ============== Routing Functions ==============

def route_after_compliance(state: WorkflowState) -> str:
    """Route based on compliance decision"""
    decision = state.get("final_decision", "ESCALATE")
    
    if decision == "APPROVE":
        return "finalize"
    elif decision == "REJECT":
        return "finalize"
    else:  # ESCALATE
        return "human_review"


def route_after_human_decision(state: WorkflowState) -> str:
    """Route after human decision is made"""
    return "finalize"


# ============== Build Workflow Graph ==============

def build_acip_workflow() -> StateGraph:
    """Build the LangGraph workflow for ACIP verification."""
    
    workflow = StateGraph(WorkflowState)
    
    # Add nodes
    workflow.add_node("start", start_workflow)
    workflow.add_node("document_inspection", document_inspection_node)
    workflow.add_node("external_verification", external_verification_node)
    workflow.add_node("compliance_decision", compliance_decision_node)
    workflow.add_node("human_review", human_review_node)
    workflow.add_node("finalize", finalize_case)
    
    # Set entry point
    workflow.set_entry_point("start")
    
    # Add edges
    workflow.add_edge("start", "document_inspection")
    workflow.add_edge("document_inspection", "external_verification")
    workflow.add_edge("external_verification", "compliance_decision")
    
    # Conditional routing after compliance decision
    workflow.add_conditional_edges(
        "compliance_decision",
        route_after_compliance,
        {
            "human_review": "human_review",
            "finalize": "finalize"
        }
    )
    
    # After human review, go to finalize
    workflow.add_edge("human_review", "finalize")
    
    # Finalize ends the workflow
    workflow.add_edge("finalize", END)
    
    return workflow


# ============== Workflow Manager ==============

class ACIPWorkflow:
    """
    High-level interface for running ACIP verification workflows.
    """
    
    def __init__(self, checkpointer=None):
        """Initialize the workflow with optional checkpointing."""
        self.graph = build_acip_workflow()
        self.app = self.graph.compile(checkpointer=checkpointer)
    
    def start_case(
        self,
        case_id: str,
        customer_name: str,
        document_path: str,
        customer_email: Optional[str] = None,
        customer_db_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Start a new ACIP verification workflow.
        
        Args:
            case_id: Unique identifier for the case
            customer_name: Customer's full name
            document_path: Path to the ID document
            customer_email: Optional customer email
            customer_db_data: Optional pre-loaded customer data for verification
            
        Returns:
            Final workflow state
        """
        thread_id = str(uuid.uuid4())
        
        initial_state = WorkflowState(
            case_id=case_id,
            thread_id=thread_id,
            customer_name=customer_name,
            customer_email=customer_email,
            document_path=document_path,
            customer_db_data=customer_db_data,
            status="pending",
            risk_level="unknown",
            inspection_result=None,
            verification_result=None,
            compliance_result=None,
            extraction_result=None,
            extraction_error=None,
            review_result=None,
            human_decision=None,
            human_notes=None,
            human_actor=None,
            final_status=None,
            final_decision=None,
            completion_time=None,
            audit_trail=[]
        )
        
        config = {"configurable": {"thread_id": thread_id}}
        
        # Run the workflow
        final_state = None
        for event in self.app.stream(initial_state, config, stream_mode="values"):
            final_state = event
        
        return final_state or initial_state
    
    def resume_with_human_input(
        self,
        thread_id: str,
        decision: str,
        actor: str,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Resume a paused workflow with human input.
        
        Args:
            thread_id: The thread ID of the paused workflow
            decision: Human decision (approve, reject, escalate)
            actor: Name/ID of the human reviewer
            notes: Optional notes from the reviewer
            
        Returns:
            Final workflow state after resumption
        """
        config = {"configurable": {"thread_id": thread_id}}
        
        human_input = Command(
            resume={
                "decision": decision,
                "actor": actor,
                "notes": notes or ""
            }
        )
        
        final_state = None
        for event in self.app.stream(human_input, config, stream_mode="values"):
            final_state = event
        
        return final_state
    
    def get_state(self, thread_id: str) -> Optional[Dict[str, Any]]:
        """Get the current state of a workflow."""
        config = {"configurable": {"thread_id": thread_id}}
        try:
            state = self.app.get_state(config)
            return state.values if state else None
        except Exception:
            return None
