"""
External Verifier Agent

Responsible for:
- Document Verification Service (DVS) checks
- PEP (Politically Exposed Persons) screening
- Sanctions list checking (OFAC, UN, EU)
- Cross-referencing multiple data sources
- Handling "near matches" intelligently
"""

import os
import time
import random
from typing import Dict, Any, Optional, List
from datetime import datetime
from .activity_logger import activity_logger, AgentType, ActivityStatus


class ExternalVerifierAgent:
    """
    AI Agent for external verification checks.
    
    Integrates with (simulated for demo):
    1. DVS - Document Verification Service
    2. PEP - Politically Exposed Persons database
    3. Sanctions - OFAC, UN, EU sanctions lists
    4. Address verification services
    """
    
    def __init__(self):
        # In production, these would be real API credentials
        self.dvs_enabled = True
        self.pep_enabled = True
        self.sanctions_enabled = True
    
    def verify(self, case_id: str, extracted_data: Dict[str, Any], customer_db_data: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Main verification method - runs all external checks.
        
        Returns:
            {
                "success": bool,
                "dvs_result": {...},
                "pep_result": {...},
                "sanctions_result": {...},
                "database_match": {...},
                "overall_status": "VERIFIED" | "PARTIAL_MATCH" | "NO_MATCH" | "FLAGGED",
                "risk_indicators": [...],
                "requires_human_review": bool
            }
        """
        # Log start - single message for all checks
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.EXTERNAL_VERIFIER,
            action="Verifying",
            details="Checking DVS, PEP & Sanctions databases...",
            status=ActivityStatus.IN_PROGRESS
        )
        
        results = {
            "success": True,
            "dvs_result": None,
            "pep_result": None,
            "sanctions_result": None,
            "database_match": None,
            "overall_status": "PENDING",
            "risk_indicators": [],
            "requires_human_review": False
        }
        
        name = f"{extracted_data.get('first_name', '')} {extracted_data.get('last_name', '')}".strip()
        doc_number = extracted_data.get("document_number") or extracted_data.get("id_number")
        
        # Run all checks (silent logging)
        results["dvs_result"] = self._check_dvs(case_id, extracted_data)
        
        if customer_db_data:
            results["database_match"] = self._verify_against_database(case_id, extracted_data, customer_db_data)
        
        results["pep_result"] = self._check_pep(case_id, name, extracted_data.get("dob"))
        results["sanctions_result"] = self._check_sanctions(case_id, name, extracted_data.get("nationality"))
        
        # Determine overall status and log completion
        results = self._determine_overall_status(case_id, results, extracted_data, customer_db_data)
        
        return results
    
    def _check_dvs(self, case_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Check document against Document Verification Service (silent)"""
        time.sleep(0.5)  # Simulate API call
        
        doc_number = data.get("document_number") or data.get("id_number")
        
        if doc_number:
            return {
                "verified": True,
                "match_score": 0.98,
                "document_valid": True,
                "document_expired": False,
                "name_match": True,
                "dob_match": True,
                "checked_at": datetime.utcnow().isoformat()
            }
        else:
            return {
                "verified": False,
                "match_score": 0,
                "error": "No document number provided",
                "checked_at": datetime.utcnow().isoformat()
            }
    
    def _verify_against_database(self, case_id: str, extracted: Dict[str, Any], db_data: Dict[str, Any]) -> Dict[str, Any]:
        """Verify extracted data against internal customer database (silent)"""
        time.sleep(0.3)
        
        discrepancies = []
        matched_fields = []
        
        field_mappings = [
            ("first_name", "first_name", "First Name"),
            ("last_name", "last_name", "Last Name"),
            ("dob", "dob", "Date of Birth"),
            ("document_number", "id_number", "ID Number"),
            ("id_number", "id_number", "ID Number")
        ]
        
        for ext_field, db_field, display_name in field_mappings:
            # Get raw value - for document_number, also check id_number as fallback
            if ext_field == "document_number":
                raw_ext_value = extracted.get(ext_field) or extracted.get("id_number")
            else:
                raw_ext_value = extracted.get(ext_field)
            
            raw_db_value = db_data.get(db_field)
            
            # Convert to string, handling None/null values properly
            # If value is None, null string, or empty, treat as missing
            if raw_ext_value in (None, "", "null", "None"):
                ext_value = None
            else:
                ext_value = str(raw_ext_value).upper().strip()
                # Also check if string conversion resulted in "NONE"
                if ext_value == "NONE":
                    ext_value = None
            
            if raw_db_value in (None, "", "null", "None"):
                db_value = None
            else:
                db_value = str(raw_db_value).upper().strip()
            
            # Skip comparison if document value is missing (extraction failed)
            # This prevents showing "Document 'NONE'" when extraction didn't work
            if ext_value is None:
                continue
            
            # If database value is missing but document has value, that's okay (new customer scenario)
            if db_value is None:
                continue
            
            # Both values exist - compare them
            if ext_value == db_value or self._is_near_match(ext_value, db_value):
                matched_fields.append(display_name)
            else:
                discrepancies.append({
                    "field": display_name,
                    "document_value": ext_value,
                    "database_value": db_value
                })
        
        match_percentage = len(matched_fields) / max(len(field_mappings), 1)
        
        return {
            "status": "VERIFIED" if not discrepancies else "DISCREPANCY",
            "match_percentage": match_percentage,
            "matched_fields": matched_fields,
            "discrepancies": discrepancies,
            "customer_id": db_data.get("customer_id")
        }
    
    def _is_near_match(self, value1: str, value2: str) -> bool:
        """Check if two values are near matches (handle common variations)"""
        # Remove common variations
        v1 = value1.replace("-", "").replace(" ", "").replace(".", "")
        v2 = value2.replace("-", "").replace(" ", "").replace(".", "")
        
        if v1 == v2:
            return True
        
        # Check for common name abbreviations
        # Jon vs John, Bob vs Robert, etc.
        common_names = {
            "JON": "JOHN", "JOHN": "JON",
            "BOB": "ROBERT", "ROBERT": "BOB",
            "BILL": "WILLIAM", "WILLIAM": "BILL",
            "MIKE": "MICHAEL", "MICHAEL": "MIKE",
            "JIM": "JAMES", "JAMES": "JIM"
        }
        
        if common_names.get(v1) == v2 or common_names.get(v2) == v1:
            return True
        
        # Check Levenshtein distance for typos
        if len(v1) > 3 and len(v2) > 3:
            distance = self._levenshtein_distance(v1, v2)
            if distance <= 2:  # Allow up to 2 character differences
                return True
        
        return False
    
    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein distance between two strings"""
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)
        
        if len(s2) == 0:
            return len(s1)
        
        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row
        
        return previous_row[-1]
    
    def _check_pep(self, case_id: str, name: str, dob: Optional[str]) -> Dict[str, Any]:
        """Check against Politically Exposed Persons database (silent)"""
        time.sleep(0.4)  # Simulate API call
        
        is_pep = "POLITICIAN" in name.upper() or "MINISTER" in name.upper()
        
        return {
            "checked": True,
            "is_pep": is_pep,
            "match_type": "exact" if is_pep else None,
            "pep_category": "Government Official" if is_pep else None,
            "sources": ["World-Check", "Dow Jones", "Refinitiv"],
            "checked_at": datetime.utcnow().isoformat()
        }
    
    def _check_sanctions(self, case_id: str, name: str, nationality: Optional[str]) -> Dict[str, Any]:
        """Check against sanctions lists (OFAC, UN, EU) - silent"""
        time.sleep(0.5)  # Simulate API calls
        
        is_sanctioned = "SANCTIONED" in name.upper()
        
        return {
            "checked": True,
            "is_sanctioned": is_sanctioned,
            "lists_checked": ["OFAC SDN", "UN Consolidated", "EU Sanctions"],
            "match_details": None if not is_sanctioned else {"list": "OFAC SDN", "match_score": 1.0},
            "checked_at": datetime.utcnow().isoformat()
        }
    
    def _determine_overall_status(self, case_id: str, results: Dict[str, Any], extracted_data: Dict[str, Any] = None, customer_db_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Determine overall verification status and log completion"""
        risk_indicators = []
        
        # Check for sanctions hit - automatic flag
        if results["sanctions_result"] and results["sanctions_result"].get("is_sanctioned"):
            results["overall_status"] = "FLAGGED"
            results["requires_human_review"] = True
            risk_indicators.append("SANCTIONS_MATCH")
        
        # Check for PEP status - requires enhanced due diligence
        elif results["pep_result"] and results["pep_result"].get("is_pep"):
            results["overall_status"] = "FLAGGED"
            results["requires_human_review"] = True
            risk_indicators.append("PEP_MATCH")
        
        # Check DVS verification
        elif results["dvs_result"] and not results["dvs_result"].get("verified"):
            results["overall_status"] = "NO_MATCH"
            results["requires_human_review"] = True
            risk_indicators.append("DVS_FAILED")
        
        # Check database discrepancies
        elif results["database_match"] and results["database_match"].get("discrepancies"):
            if len(results["database_match"]["discrepancies"]) > 2:
                results["overall_status"] = "NO_MATCH"
                results["requires_human_review"] = True
            else:
                results["overall_status"] = "PARTIAL_MATCH"
                results["requires_human_review"] = True
            risk_indicators.append("DATABASE_DISCREPANCY")
        
        # All checks passed
        else:
            results["overall_status"] = "VERIFIED"
            results["requires_human_review"] = False
        
        results["risk_indicators"] = risk_indicators
        
        status_emoji = {
            "VERIFIED": "✓",
            "PARTIAL_MATCH": "⚠",
            "NO_MATCH": "✗",
            "FLAGGED": "🚨"
        }
        
        # Build detailed check results for frontend
        dvs_status = "VERIFIED" if results.get("dvs_result", {}).get("verified") else "FAILED"
        pep_status = "FLAGGED" if results.get("pep_result", {}).get("is_pep") else "CLEAR"
        sanctions_status = "FLAGGED" if results.get("sanctions_result", {}).get("is_sanctioned") else "CLEAR"
        
        db_match = results.get("database_match", {})
        
        # Calculate name and DOB match status from discrepancies
        name_match = "MATCH"
        dob_match = "MATCH"
        
        if db_match.get("discrepancies"):
            for disc in db_match["discrepancies"]:
                if "First Name" in disc.get("field", "") or "Last Name" in disc.get("field", ""):
                    name_match = "NO_MATCH"
                if "Date of Birth" in disc.get("field", ""):
                    dob_match = "NO_MATCH"
        
        # If we have matched fields, check if name/DOB are in there
        if db_match.get("matched_fields"):
            matched = db_match["matched_fields"]
            if "First Name" in matched and "Last Name" in matched:
                name_match = "MATCH"
            if "Date of Birth" in matched:
                dob_match = "MATCH"
        
        # Format discrepancies for rationale
        rationale = []
        for d in db_match.get("discrepancies", []):
            rationale.append(f"{d['field']}: Document '{d['document_value']}' vs Database '{d['database_value']}'")
        
        # Prepare comparison data for frontend
        comparison_data = None
        if extracted_data and customer_db_data:
            comparison_data = {
                "extracted": {
                    "first_name": extracted_data.get("first_name", ""),
                    "last_name": extracted_data.get("last_name", ""),
                    "dob": extracted_data.get("dob", ""),
                    "document_number": extracted_data.get("document_number") or extracted_data.get("id_number", ""),
                },
                "database": {
                    "first_name": customer_db_data.get("first_name", ""),
                    "last_name": customer_db_data.get("last_name", ""),
                    "dob": customer_db_data.get("dob", ""),
                    "id_number": customer_db_data.get("id_number", ""),
                }
            }
        
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.EXTERNAL_VERIFIER,
            action="Verification Complete",
            details=f"{status_emoji.get(results['overall_status'], '•')} Overall status: {results['overall_status']}",
            status=ActivityStatus.SUCCESS if results["overall_status"] == "VERIFIED" else ActivityStatus.WARNING,
            data={
                "overall_status": results["overall_status"],
                "risk_indicators": risk_indicators,
                "requires_human_review": results["requires_human_review"],
                "dvs_status": dvs_status,
                "pep_status": pep_status,
                "sanctions_status": sanctions_status,
                "name_match_status": name_match,
                "dob_match_status": dob_match,
                "discrepancies": db_match.get("discrepancies", []),
                "rationale": rationale,
                "comparison": comparison_data
            }
        )
        
        return results
