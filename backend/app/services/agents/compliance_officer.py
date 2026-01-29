"""
Compliance Officer Agent

Responsible for:
- Final risk assessment based on all gathered evidence
- Decision making (Approve, Reject, Escalate)
- Generating AUSTRAC-compliant audit trail
- Applying bank's Risk Appetite Statement rules
"""

import json
from typing import Dict, Any, Optional, List
from datetime import datetime
from .activity_logger import activity_logger, AgentType, ActivityStatus


class ComplianceOfficerAgent:
    """
    AI Agent for compliance decision-making.
    
    Reviews findings from Document Inspector and External Verifier
    to make final ACIP determination.
    """
    
    def __init__(self):
        from app.config import get_settings
        self.settings = get_settings()
        
        # Risk appetite rules (in production, loaded from config)
        # DISABLED auto-approval - all cases require human-in-the-loop review
        self.risk_rules = {
            "auto_approve_verified_low_risk": False,  # Always require human review
            "max_discrepancies_for_auto_approve": 0,
            "pep_requires_edd": True,  # Enhanced Due Diligence
            "sanctions_auto_reject": True,
            "dvs_required": True
        }
    
    def assess(
        self, 
        case_id: str,
        inspection_result: Dict[str, Any],
        verification_result: Dict[str, Any],
        customer_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Main assessment method - makes final ACIP decision.
        
        Returns:
            {
                "decision": "APPROVE" | "REJECT" | "ESCALATE",
                "risk_level": "LOW" | "MEDIUM" | "HIGH",
                "confidence_score": float,
                "reasoning": str,
                "audit_trail": [...],
                "restrictions": [...] if any,
                "next_steps": str
            }
        """
        # Log start - single message
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.COMPLIANCE_OFFICER,
            action="Assessing Risk",
            details="Evaluating evidence against compliance rules...",
            status=ActivityStatus.IN_PROGRESS
        )
        
        audit_trail = []
        risk_factors = []
        mitigating_factors = []
        
        # Assess document evidence (silent)
        doc_assessment = self._assess_document_evidence(case_id, inspection_result)
        audit_trail.append(doc_assessment["audit_entry"])
        risk_factors.extend(doc_assessment.get("risk_factors", []))
        mitigating_factors.extend(doc_assessment.get("mitigating_factors", []))
        
        # Assess external evidence (silent)
        ext_assessment = self._assess_external_evidence(case_id, verification_result)
        audit_trail.append(ext_assessment["audit_entry"])
        risk_factors.extend(ext_assessment.get("risk_factors", []))
        mitigating_factors.extend(ext_assessment.get("mitigating_factors", []))
        
        risk_level = self._calculate_risk_level(risk_factors, mitigating_factors)
        
        # Step 4: Make Decision
        decision_result = self._make_decision(
            case_id=case_id,
            risk_level=risk_level,
            risk_factors=risk_factors,
            mitigating_factors=mitigating_factors,
            inspection_result=inspection_result,
            verification_result=verification_result
        )
        
        # Step 5: Generate Final Audit Entry
        final_audit = {
            "timestamp": datetime.utcnow().isoformat(),
            "step": "ACIP_DETERMINATION",
            "agent": "Compliance Officer",
            "decision": decision_result["decision"],
            "risk_level": risk_level,
            "confidence_score": decision_result["confidence_score"],
            "reasoning": decision_result["reasoning"],
            "risk_factors": risk_factors,
            "mitigating_factors": mitigating_factors
        }
        audit_trail.append(final_audit)
        
        # Log final decision
        decision_emoji = {
            "APPROVE": "✅",
            "REJECT": "❌",
            "ESCALATE": "⚠️"
        }
        
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.COMPLIANCE_OFFICER,
            action="ACIP Decision",
            details=f"{decision_emoji.get(decision_result['decision'], '•')} Decision: {decision_result['decision']} | Risk: {risk_level}",
            status=ActivityStatus.DECISION,
            data={
                "decision": decision_result["decision"],
                "risk_level": risk_level,
                "confidence": decision_result["confidence_score"]
            }
        )
        
        return {
            "decision": decision_result["decision"],
            "risk_level": risk_level,
            "confidence_score": decision_result["confidence_score"],
            "reasoning": decision_result["reasoning"],
            "audit_trail": audit_trail,
            "restrictions": decision_result.get("restrictions", []),
            "next_steps": decision_result["next_steps"],
            "risk_factors": risk_factors,
            "mitigating_factors": mitigating_factors
        }
    
    def _assess_document_evidence(self, case_id: str, inspection_result: Dict[str, Any]) -> Dict[str, Any]:
        """Assess document inspection evidence (silent)"""
        risk_factors = []
        mitigating_factors = []
        
        if not inspection_result.get("success"):
            risk_factors.append("Document extraction failed")
        else:
            mitigating_factors.append("Document successfully extracted")
            
            quality = inspection_result.get("quality_score", 0)
            if quality >= 0.9:
                mitigating_factors.append(f"High quality document ({quality:.0%})")
            elif quality < 0.7:
                risk_factors.append(f"Low quality document ({quality:.0%})")
            
            if inspection_result.get("issues"):
                for issue in inspection_result["issues"]:
                    risk_factors.append(f"Validation issue: {issue}")
            else:
                mitigating_factors.append("All document fields validated")
        
        return {
            "audit_entry": {
                "timestamp": datetime.utcnow().isoformat(),
                "step": "DOCUMENT_REVIEW",
                "agent": "Compliance Officer",
                "result": "ACCEPTABLE" if inspection_result.get("success") else "CONCERNS",
                "details": {
                    "quality_score": inspection_result.get("quality_score"),
                    "document_type": inspection_result.get("document_type"),
                    "issues": inspection_result.get("issues", [])
                }
            },
            "risk_factors": risk_factors,
            "mitigating_factors": mitigating_factors
        }
    
    def _assess_external_evidence(self, case_id: str, verification_result: Dict[str, Any]) -> Dict[str, Any]:
        """Assess external verification evidence (silent)"""
        risk_factors = []
        mitigating_factors = []
        
        # DVS Check
        dvs = verification_result.get("dvs_result", {})
        if dvs.get("verified"):
            mitigating_factors.append(f"DVS verified (Match: {dvs.get('match_score', 0):.0%})")
        else:
            risk_factors.append("DVS verification failed")
        
        # Database Match
        db_match = verification_result.get("database_match", {})
        if db_match.get("status") == "VERIFIED":
            mitigating_factors.append("Customer database match confirmed")
        elif db_match.get("discrepancies"):
            for disc in db_match["discrepancies"]:
                risk_factors.append(f"Discrepancy in {disc['field']}")
        
        # PEP Check
        pep = verification_result.get("pep_result", {})
        if pep.get("is_pep"):
            risk_factors.append(f"PEP status: {pep.get('pep_category', 'Unknown')}")
        else:
            mitigating_factors.append("No PEP associations found")
        
        # Sanctions Check
        sanctions = verification_result.get("sanctions_result", {})
        if sanctions.get("is_sanctioned"):
            risk_factors.append("SANCTIONS HIT")
        else:
            mitigating_factors.append("Cleared all sanctions lists")
        
        overall = verification_result.get("overall_status", "PENDING")
        
        return {
            "audit_entry": {
                "timestamp": datetime.utcnow().isoformat(),
                "step": "EXTERNAL_VERIFICATION_REVIEW",
                "agent": "Compliance Officer",
                "result": overall,
                "details": {
                    "dvs_verified": dvs.get("verified", False),
                    "pep_clear": not pep.get("is_pep", False),
                    "sanctions_clear": not sanctions.get("is_sanctioned", False),
                    "database_match": db_match.get("status", "NOT_CHECKED")
                }
            },
            "risk_factors": risk_factors,
            "mitigating_factors": mitigating_factors
        }
    
    def _calculate_risk_level(self, risk_factors: List[str], mitigating_factors: List[str]) -> str:
        """Calculate overall risk level"""
        
        # Critical risk factors that automatically set HIGH risk
        critical_keywords = ["SANCTIONS", "PEP status", "DVS verification failed"]
        for factor in risk_factors:
            for keyword in critical_keywords:
                if keyword in factor:
                    return "HIGH"
        
        # Calculate risk score
        risk_score = len(risk_factors) * 2 - len(mitigating_factors)
        
        if risk_score <= -2:
            return "LOW"
        elif risk_score <= 2:
            return "MEDIUM"
        else:
            return "HIGH"
    
    def _make_decision(
        self,
        case_id: str,
        risk_level: str,
        risk_factors: List[str],
        mitigating_factors: List[str],
        inspection_result: Dict[str, Any],
        verification_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Make final ACIP decision based on all evidence"""
        
        # Check for automatic rejection conditions
        sanctions = verification_result.get("sanctions_result", {})
        if sanctions.get("is_sanctioned") and self.risk_rules.get("sanctions_auto_reject"):
            return {
                "decision": "REJECT",
                "confidence_score": 0.99,
                "reasoning": "Automatic rejection due to sanctions list match. This is a regulatory requirement.",
                "next_steps": "Case flagged for Compliance review. Customer must not be onboarded.",
                "restrictions": ["ACCOUNT_FROZEN", "NO_TRANSACTIONS"]
            }
        
        # Check for automatic escalation conditions
        pep = verification_result.get("pep_result", {})
        if pep.get("is_pep") and self.risk_rules.get("pep_requires_edd"):
            return {
                "decision": "ESCALATE",
                "confidence_score": 0.85,
                "reasoning": f"Customer identified as PEP ({pep.get('pep_category', 'Unknown')}). Enhanced Due Diligence required per bank policy.",
                "next_steps": "Escalated to Senior Compliance Officer for EDD review.",
                "restrictions": ["LIMITED_TRANSACTIONS"]
            }
        
        # ALWAYS escalate to human review - no auto-approval
        # All cases require human-in-the-loop review per AUSTRAC compliance requirements
        verification_status = verification_result.get("overall_status")
        
        reasons = []
        if risk_factors:
            reasons.append(f"Risk factors identified: {', '.join(risk_factors[:3])}")
        if verification_status != "VERIFIED":
            reasons.append(f"Verification status: {verification_status}")
        if risk_level == "LOW" and verification_status == "VERIFIED":
            reasons.append("Low risk profile - ready for human review")
        else:
            reasons.append(f"Risk level: {risk_level}")
        
        return {
            "decision": "ESCALATE",
            "confidence_score": 0.85 if verification_status == "VERIFIED" and risk_level == "LOW" else 0.70,
            "reasoning": " ".join(reasons) if reasons else "Requires human review per AUSTRAC compliance requirements.",
            "next_steps": "Escalated to Operations team for manual review and approval.",
            "restrictions": ["LIMITED_TRANSACTIONS"] if risk_level in ["MEDIUM", "HIGH"] else []
        }
    
    def generate_audit_report(
        self, 
        case_id: str, 
        assessment_result: Dict[str, Any],
        user_actions: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Generate AUSTRAC-compliant audit report with human-in-the-loop notes.
        
        Args:
            case_id: The case ID
            assessment_result: The compliance assessment result
            user_actions: List of user actions with notes (from CaseAction records)
        """
        
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.COMPLIANCE_OFFICER,
            action="Generating Audit Report",
            details="Creating AUSTRAC-compliant documentation...",
            status=ActivityStatus.IN_PROGRESS
        )
        
        report_lines = [
            "=" * 60,
            "ACIP VERIFICATION AUDIT REPORT",
            "=" * 60,
            f"Case ID: {case_id}",
            f"Generated: {datetime.utcnow().isoformat()}",
            "",
            "SUMMARY",
            "-" * 40,
            f"Decision: {assessment_result['decision']}",
            f"Risk Level: {assessment_result['risk_level']}",
            f"Confidence Score: {assessment_result['confidence_score']:.0%}",
            "",
            "REASONING",
            "-" * 40,
            assessment_result['reasoning'],
            "",
            "AUDIT TRAIL",
            "-" * 40,
        ]
        
        for entry in assessment_result.get("audit_trail", []):
            report_lines.append(f"[{entry['timestamp']}] {entry['step']}")
            report_lines.append(f"  Agent: {entry.get('agent', 'System')}")
            report_lines.append(f"  Result: {entry.get('result', 'N/A')}")
            report_lines.append("")
        
        report_lines.extend([
            "RISK FACTORS",
            "-" * 40,
        ])
        for factor in assessment_result.get("risk_factors", []):
            report_lines.append(f"  • {factor}")
        
        report_lines.extend([
            "",
            "MITIGATING FACTORS",
            "-" * 40,
        ])
        for factor in assessment_result.get("mitigating_factors", []):
            report_lines.append(f"  • {factor}")
        
        # Add Human Review Notes section if user actions exist
        if user_actions:
            report_lines.extend([
                "",
                "HUMAN REVIEW NOTES",
                "-" * 40,
            ])
            
            # Filter actions that have notes
            actions_with_notes = [
                action for action in user_actions 
                if action.get("notes") and action.get("notes").strip()
            ]
            
            if actions_with_notes:
                for action in actions_with_notes:
                    action_type = action.get("action_type", "unknown").upper()
                    performed_by = action.get("performed_by", "Unknown")
                    notes = action.get("notes", "")
                    created_at = action.get("created_at", "")
                    
                    report_lines.append(f"[{created_at}] {action_type} by {performed_by}")
                    report_lines.append(f"  Notes: {notes}")
                    if action.get("previous_status") and action.get("new_status"):
                        report_lines.append(
                            f"  Status Change: {action['previous_status']} → {action['new_status']}"
                        )
                    report_lines.append("")
            else:
                report_lines.append("  No review notes recorded.")
        
        report_lines.extend([
            "",
            "NEXT STEPS",
            "-" * 40,
            assessment_result.get("next_steps", "N/A"),
            "",
            "=" * 60,
            "END OF REPORT",
            "=" * 60,
        ])
        
        report = "\n".join(report_lines)
        
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.COMPLIANCE_OFFICER,
            action="Audit Report Complete",
            details="AUSTRAC-compliant audit documentation generated",
            status=ActivityStatus.SUCCESS
        )
        
        return report
