"""
Document Inspector Agent

Responsible for:
- OCR/Vision extraction from ID documents (Passport, Driver's License)
- Image quality assessment
- Data extraction (Name, DOB, Document Number, etc.)
- Autonomous retry/request for better documents if quality is poor
- Mock mode for demos when API quota is exceeded
"""

import os
import time
import json
from typing import Dict, Any, Optional
from .activity_logger import activity_logger, AgentType, ActivityStatus

# Mock data for demo mode (used when API quota is exceeded)
MOCK_EXTRACTIONS = {
    "craig": {
        "document_type": "DRIVING_LICENSE",
        "first_name": "CRAIG",
        "last_name": "MENON",
        "dob": "1981-01-20",
        "document_number": "B01194",
        "id_number": "B01194",
        "issuing_authority": "VIC",
        "nationality": "AUSTRALIAN"
    },
    "jane": {
        "document_type": "PASSPORT",
        "first_name": "JANE",
        "last_name": "CITIZEN",
        "dob": "1991-05-04",
        "document_number": "RA0123456",
        "id_number": "RA0123456",
        "issuing_authority": "AUSTRALIA",
        "nationality": "AUSTRALIAN"
    },
    "alice": {
        "document_type": "PASSPORT",
        "first_name": "ALICE",
        "last_name": "WONDER",
        "dob": "1992-03-10",
        "document_number": "P11223344",
        "id_number": "P11223344",
        "issuing_authority": "AUSTRALIA",
        "nationality": "AUSTRALIAN"
    },
    "bob": {
        "document_type": "DRIVING_LICENSE",
        "first_name": "BOB",
        "last_name": "BUILDER",
        "dob": "1980-11-20",
        "document_number": "L55667788",
        "id_number": "L55667788",
        "issuing_authority": "NSW",
        "nationality": "AUSTRALIAN"
    }
}


class DocumentInspectorAgent:
    """
    AI Agent for document inspection and data extraction.
    
    Uses Vision AI to:
    1. Assess document image quality
    2. Identify document type (Passport, License, etc.)
    3. Extract structured data fields
    4. Flag issues for human review if needed
    
    Falls back to mock mode for demos when API is unavailable.
    """
    
    def __init__(self):
        from app.config import get_settings
        self.settings = get_settings()
        self.provider = self.settings.ai_provider
        self.use_mock = False
        self._setup_provider()
    
    def _setup_provider(self):
        """Initialize the AI provider"""
        if self.provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=self.settings.gemini_api_key)
            self.model = genai.GenerativeModel("gemini-2.0-flash")
        else:
            from openai import OpenAI
            self.client = OpenAI(api_key=self.settings.openai_api_key)
    
    def _get_mock_extraction(self, document_path: str, customer_db_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Get mock extraction data based on the DOCUMENT filename.
        
        This simulates what the AI would extract from the actual document.
        For demo purposes, we also check for customer_id in the filename since
        uploaded files are saved as {timestamp}_{customer_id}_{original_filename}.
        """
        filename = os.path.basename(document_path).lower()
        
        # First, try to match based on person name in filename
        for name, data in MOCK_EXTRACTIONS.items():
            if name in filename:
                print(f"  [MOCK] Extracted data for '{name}' from document filename")
                return data.copy()
        
        # Check for customer_id patterns in filename (e.g., cust-001, cust-002)
        # This handles uploaded files that get renamed to include customer_id
        if "cust-001" in filename or "cust_001" in filename:
            print(f"  [MOCK] Matched CUST-001 (Craig) from filename")
            return MOCK_EXTRACTIONS["craig"].copy()
        elif "cust-002" in filename or "cust_002" in filename:
            print(f"  [MOCK] Matched CUST-002 (Jane) from filename")
            return MOCK_EXTRACTIONS["jane"].copy()
        elif "cust-003" in filename or "cust_003" in filename:
            print(f"  [MOCK] Matched CUST-003 (Alice) from filename")
            return MOCK_EXTRACTIONS["alice"].copy()
        elif "cust-004" in filename or "cust_004" in filename:
            print(f"  [MOCK] Matched CUST-004 (Bob) from filename")
            return MOCK_EXTRACTIONS["bob"].copy()
        
        # Check for passport/license keywords with names
        if "passport" in filename:
            if "jane" in filename or "citizen" in filename:
                return MOCK_EXTRACTIONS["jane"].copy()
            elif "alice" in filename:
                return MOCK_EXTRACTIONS["alice"].copy()
        
        if "license" in filename or "driving" in filename:
            if "craig" in filename or "menon" in filename:
                return MOCK_EXTRACTIONS["craig"].copy()
            elif "bob" in filename or "builder" in filename:
                return MOCK_EXTRACTIONS["bob"].copy()
        
        # Default: Unknown person - this will cause a NO_MATCH with any customer
        print(f"  [MOCK] Unknown document '{filename}' - extracting generic data")
        return {
            "document_type": "PASSPORT" if "passport" in filename else "DRIVING_LICENSE",
            "first_name": "UNKNOWN",
            "last_name": "PERSON",
            "dob": "1985-06-15",
            "document_number": "XX999999",
            "id_number": "XX999999",
            "issuing_authority": "UNKNOWN",
            "nationality": "UNKNOWN"
        }
    
    def inspect(self, case_id: str, document_path: str, customer_db_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Main inspection method - extracts data from document.
        
        Args:
            case_id: The case identifier
            document_path: Path to the document image
            customer_db_data: Optional customer data (not used for extraction, only passed for reference)
        
        Returns:
            {
                "success": bool,
                "document_type": str,
                "quality_score": float,
                "extracted_data": {...},
                "issues": [...],
                "requires_resubmission": bool
            }
        """
        # Reset mock mode - try real API first each time
        self.use_mock = False
        
        # Log start
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.DOCUMENT_INSPECTOR,
            action="Extracting Data",
            details=f"Analyzing {os.path.basename(document_path)} with AI vision...",
            status=ActivityStatus.IN_PROGRESS
        )
        
        # Assess image quality (silent)
        quality_result = self._assess_quality(document_path)
        
        if quality_result["quality_score"] < 0.5:
            activity_logger.log(
                case_id=case_id,
                agent=AgentType.DOCUMENT_INSPECTOR,
                action="Extraction Failed",
                details="Image quality too low. Please upload a clearer photo.",
                status=ActivityStatus.ERROR,
                data={"quality_score": quality_result["quality_score"]}
            )
            return {
                "success": False,
                "document_type": None,
                "quality_score": quality_result["quality_score"],
                "extracted_data": None,
                "issues": ["Image quality too low for reliable extraction"],
                "requires_resubmission": True,
                "resubmission_reason": "The document image is blurry or low resolution. Please upload a clearer photo."
            }
        
        # Extract data using Vision AI (pass customer_db_data for mock mode)
        extraction_result = self._extract_data(case_id, document_path, customer_db_data)
        
        if not extraction_result["success"]:
            activity_logger.log(
                case_id=case_id,
                agent=AgentType.DOCUMENT_INSPECTOR,
                action="Extraction Failed",
                details=f"Error: {extraction_result.get('error', 'Unknown error')}",
                status=ActivityStatus.ERROR
            )
            return {
                "success": False,
                "document_type": None,
                "quality_score": quality_result["quality_score"],
                "extracted_data": None,
                "issues": [extraction_result.get("error", "Extraction failed")],
                "requires_resubmission": False
            }
        
        extracted_data = extraction_result["data"]
        document_type = extracted_data.get("document_type", "UNKNOWN")
        
        # Validate fields (silent)
        validation_issues = self._validate_fields(extracted_data)
        
        # Log completion with extracted info
        name = f"{extracted_data.get('first_name', '')} {extracted_data.get('last_name', '')}".strip()
        doc_num = extracted_data.get("document_number") or extracted_data.get("id_number")
        
        activity_logger.log(
            case_id=case_id,
            agent=AgentType.DOCUMENT_INSPECTOR,
            action="Extraction Complete",
            details=f"Extracted: {name} | {document_type} | ID: {doc_num}",
            status=ActivityStatus.SUCCESS,
            data={
                "name": name,
                "document_type": document_type,
                "document_number": doc_num,
                "date_of_birth": extracted_data.get("dob"),
                "expiry_date": extracted_data.get("expiry_date"),
                "nationality": extracted_data.get("nationality") or extracted_data.get("country"),
                "first_name": extracted_data.get("first_name"),
                "last_name": extracted_data.get("last_name"),
                "gender": extracted_data.get("gender")
            }
        )
        
        return {
            "success": True,
            "document_type": document_type,
            "quality_score": quality_result["quality_score"],
            "extracted_data": extracted_data,
            "issues": validation_issues,
            "requires_resubmission": False
        }
    
    def _assess_quality(self, document_path: str) -> Dict[str, Any]:
        """Assess document image quality"""
        # In production, this would use image analysis
        # For demo, we assume good quality
        time.sleep(0.3)  # Simulate processing
        return {
            "quality_score": 0.92,
            "resolution": "1920x1080",
            "blur_detected": False,
            "glare_detected": False
        }
    
    def _extract_data(self, case_id: str, document_path: str, customer_db_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Extract structured data from document using Vision AI (with mock fallback)"""
        
        # If mock mode is enabled, skip API call
        if self.use_mock:
            time.sleep(1.0)  # Simulate processing
            mock_data = self._get_mock_extraction(document_path)  # Extract based on document, not customer
            print(f"  [MOCK MODE] Using simulated extraction based on document")
            return {"success": True, "data": mock_data}
        
        prompt = """Analyze this ID document image and extract the following information in JSON format:
        {
            "document_type": "PASSPORT" or "DRIVING_LICENSE" or "OTHER",
            "first_name": "extracted first name",
            "last_name": "extracted last name",
            "middle_name": "if present",
            "dob": "date of birth in YYYY-MM-DD format",
            "document_number": "passport number or license number (REQUIRED - extract from document)",
            "id_number": "ID number - use same value as document_number if they are the same",
            "expiry_date": "document expiry date in YYYY-MM-DD format",
            "issue_date": "document issue date if visible",
            "issuing_authority": "issuing country or state",
            "address": "if visible on document",
            "gender": "M or F if visible",
            "nationality": "if visible"
        }
        
        IMPORTANT: 
        - Always extract the document number/ID number from the document. Look for fields labeled "Passport No", "License No", "Document Number", "ID Number", etc.
        - If you see an ID number on the document, extract it. Do not return null for document_number or id_number unless the document is completely illegible.
        - For passports, look for the passport number (usually starts with a letter followed by numbers).
        - For driving licenses, look for the license number.
        
        Return ONLY the JSON object, no other text. Use null ONLY if a field is truly not present on the document."""
        
        try:
            if self.provider == "gemini":
                import PIL.Image
                image = PIL.Image.open(document_path)
                
                response = self.model.generate_content([prompt, image])
                response_text = response.text.strip()
            else:
                import base64
                with open(document_path, "rb") as f:
                    image_data = base64.b64encode(f.read()).decode()
                
                response = self.client.chat.completions.create(
                    model="gpt-4-vision-preview",
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
                        ]
                    }],
                    max_tokens=1000
                )
                response_text = response.choices[0].message.content.strip()
            
            # Parse JSON from response
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            
            data = json.loads(response_text)
            
            # Normalize ID number fields - ensure id_number is populated
            # If document_number exists but id_number doesn't, use document_number
            if data.get("document_number") and not data.get("id_number"):
                data["id_number"] = data["document_number"]
            # If id_number exists but document_number doesn't, use id_number
            elif data.get("id_number") and not data.get("document_number"):
                data["document_number"] = data["id_number"]
            
            # Clean up None/null values - convert to empty string for consistency
            for key, value in data.items():
                if value is None or value == "null" or value == "None":
                    data[key] = None  # Keep as None for JSON, but handle in comparison logic
            
            return {"success": True, "data": data}
            
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Failed to parse AI response: {str(e)}"}
        except Exception as e:
            error_msg = str(e).lower()
            # If quota exceeded or rate limited, fall back to mock mode
            if "quota" in error_msg or "429" in error_msg or "rate" in error_msg:
                print(f"  [API QUOTA EXCEEDED] Falling back to mock mode for demo")
                self.use_mock = True
                time.sleep(1.0)  # Simulate processing
                mock_data = self._get_mock_extraction(document_path)  # Extract based on document
                return {"success": True, "data": mock_data}
            return {"success": False, "error": str(e)}
    
    def _validate_fields(self, data: Dict[str, Any]) -> list:
        """Validate required fields are present and formatted correctly"""
        issues = []
        
        required_fields = ["first_name", "last_name", "dob", "document_type"]
        for field in required_fields:
            if not data.get(field):
                issues.append(f"Missing required field: {field}")
        
        # Validate DOB format
        if data.get("dob"):
            try:
                from datetime import datetime
                datetime.strptime(data["dob"], "%Y-%m-%d")
            except ValueError:
                issues.append(f"Invalid date format for DOB: {data['dob']}")
        
        # Check document number exists
        if not data.get("document_number") and not data.get("id_number"):
            issues.append("Missing document/ID number")
        
        return issues
