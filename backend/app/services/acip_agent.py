"""ACIP Agent for document extraction and verification.

Refactored from the original agent.py and kyc_verifier.py to work
with the LangGraph workflow.
"""

import os
import json
import base64
import mimetypes
from typing import Optional, Dict, Any
from app.config import get_settings

settings = get_settings()


class ACIPExtractor:
    """
    AI-powered document extractor for KYC/ACIP processing.
    
    Supports both OpenAI and Google Gemini providers.
    """
    
    def __init__(self, provider: Optional[str] = None):
        self.provider = (provider or settings.ai_provider).lower()
        self._setup_provider()
    
    def _setup_provider(self):
        """Initialize the AI provider."""
        if self.provider == "gemini":
            import google.generativeai as genai
            api_key = settings.gemini_api_key
            if not api_key:
                raise ValueError("GEMINI_API_KEY not found in settings")
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-2.0-flash')
            self._genai = genai
            
        elif self.provider == "openai":
            from openai import OpenAI
            api_key = settings.openai_api_key
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found in settings")
            self.client = OpenAI(api_key=api_key)
            self.model_name = "gpt-4o-mini"
        else:
            raise ValueError(f"Invalid provider: {self.provider}. Choose 'gemini' or 'openai'.")
    
    def _encode_image(self, image_path: str) -> str:
        """Encode image to base64."""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode('utf-8')
    
    def extract(self, file_path: str) -> Dict[str, Any]:
        """
        Extract KYC data from a document.
        
        Returns:
            Dict with extracted fields or error information
        """
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            if file_path.lower().endswith('.pdf'):
                mime_type = 'application/pdf'
            elif file_path.lower().endswith(('.png', '.jpg', '.jpeg')):
                mime_type = 'image/jpeg'
        
        prompt = """
        You are an expert KYC document extractor for AUSTRAC compliance.
        
        Extract the following information from this ID document (Passport, Driving License, etc.):
        1. First Name
        2. Last Name
        3. Date of Birth (YYYY-MM-DD format)
        4. ID Number (Passport No, License No, etc.)
        5. Document Type (e.g., PASSPORT, DRIVING_LICENSE, ID_CARD)
        6. Expiry Date (YYYY-MM-DD format) - if available
        7. Issuing Country/State - if visible
        8. Address - if visible
        
        Also assess the document quality and provide a confidence score.
        
        Return strict JSON. No markdown.
        Structure:
        {
            "first_name": "...",
            "last_name": "...",
            "dob": "...",
            "id_number": "...",
            "document_type": "...",
            "expiry_date": "...",
            "issuing_authority": "...",
            "address": "...",
            "confidence_score": 0.0-1.0,
            "quality_issues": ["list of any issues detected"]
        }
        """
        
        try:
            if self.provider == "gemini":
                uploaded_file = self._genai.upload_file(file_path, mime_type=mime_type)
                response = self.model.generate_content([prompt, uploaded_file])
                text = response.text
                
            elif self.provider == "openai":
                base64_image = self._encode_image(file_path)
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                            }
                        ]
                    }],
                    response_format={"type": "json_object"}
                )
                text = response.choices[0].message.content
            
            # Clean and parse JSON
            text = text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            
            return {
                "success": True,
                "data": json.loads(text)
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def review(self, file_path: str, primary_extraction: Dict) -> Dict[str, Any]:
        """
        Review and verify a primary extraction result.
        
        This is the "reviewer agent" that double-checks the extraction.
        """
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            if file_path.lower().endswith('.pdf'):
                mime_type = 'application/pdf'
            elif file_path.lower().endswith(('.png', '.jpg', '.jpeg')):
                mime_type = 'image/jpeg'
        
        review_prompt = f"""
        You are a REVIEWER AGENT performing quality control on KYC data extraction.
        
        Another AI agent extracted the following data from a KYC document:
        {json.dumps(primary_extraction, indent=2)}
        
        Your job is to:
        1. Review the document image again
        2. Verify if the extracted data is ACCURATE
        3. Identify any MISTAKES or MISSING fields
        4. Provide CORRECTIONS if needed
        5. Assess if this requires human review
        
        Return your review as JSON:
        {{
            "review_status": "APPROVED" or "NEEDS_CORRECTION" or "NEEDS_HUMAN_REVIEW",
            "confidence_score": 0.0-1.0,
            "corrections": {{
                "field_name": "corrected_value"
            }},
            "issues_found": [
                "Description of issue 1"
            ],
            "risk_indicators": [
                "Any suspicious patterns detected"
            ],
            "recommended_risk_level": "low" or "medium" or "high",
            "reviewer_notes": "Any additional observations"
        }}
        """
        
        try:
            if self.provider == "gemini":
                uploaded_file = self._genai.upload_file(file_path, mime_type=mime_type)
                response = self.model.generate_content([review_prompt, uploaded_file])
                text = response.text
                
            elif self.provider == "openai":
                base64_image = self._encode_image(file_path)
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": review_prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                            }
                        ]
                    }],
                    response_format={"type": "json_object"}
                )
                text = response.choices[0].message.content
            
            text = text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            
            return {
                "success": True,
                "review": json.loads(text)
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


class ACIPVerifier:
    """
    Verifies extracted data against internal customer database.
    
    For AUSTRAC compliance, this compares document data against
    existing customer records.
    """
    
    def __init__(self, db_path: str = "customer_db.json"):
        self.db_path = db_path
        self.db = {}
        self.db_index = {}
        self._load_db()
    
    def _load_db(self):
        """Load customer database."""
        if os.path.exists(self.db_path):
            with open(self.db_path, 'r') as f:
                self.db = json.load(f)
            # Index by ID number for quick lookup
            self.db_index = {
                record.get('id_number', '').upper().strip(): record 
                for record in self.db
            }
    
    def verify(self, extracted_data: Dict) -> Dict[str, Any]:
        """
        Verify extracted data against internal database.
        
        Returns verification result with discrepancies.
        """
        if not extracted_data:
            return {
                "status": "FAILED",
                "reason": "No data to verify"
            }
        
        id_number = extracted_data.get("id_number", "").upper().strip()
        if not id_number:
            return {
                "status": "FLAGGED",
                "reason": "ID Number not found in document",
                "requires_human_review": True
            }
        
        record = self.db_index.get(id_number)
        if not record:
            return {
                "status": "NEW_CUSTOMER",
                "reason": f"ID {id_number} not found in internal database",
                "requires_human_review": True,
                "extracted_data": extracted_data
            }
        
        # Compare fields
        discrepancies = []
        fields_to_check = ["first_name", "last_name", "dob", "document_type"]
        
        for field in fields_to_check:
            extracted_val = str(extracted_data.get(field, "")).upper().strip()
            db_val = str(record.get(field, "")).upper().strip()
            
            if extracted_val and db_val and extracted_val != db_val:
                discrepancies.append({
                    "field": field,
                    "document_value": extracted_val,
                    "database_value": db_val
                })
        
        if discrepancies:
            return {
                "status": "FLAGGED",
                "customer_id": record.get("customer_id"),
                "discrepancies": discrepancies,
                "requires_human_review": True,
                "extracted_data": extracted_data,
                "internal_record": record
            }
        
        return {
            "status": "VERIFIED",
            "customer_id": record.get("customer_id"),
            "message": "All fields match internal records",
            "requires_human_review": False,
            "extracted_data": extracted_data,
            "internal_record": record
        }
