import os
import json
import base64
from typing import Dict, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate

class LangChainKYCAgent:
    """
    LangChain-powered KYC extraction agent with structured output.
    """
    
    def __init__(self, provider: str = "gemini"):
        self.provider = provider.lower()
        
        if self.provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY not found.")
            self.llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash",
                google_api_key=api_key,
                temperature=0  # Deterministic for data extraction
            )
            
        elif self.provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found.")
            self.llm = ChatOpenAI(
                model="gpt-4o-mini",
                api_key=api_key,
                temperature=0
            )
        else:
            raise ValueError("Invalid provider. Choose 'gemini' or 'openai'.")
        
        # JSON output parser
        self.parser = JsonOutputParser()
        
        # Extraction prompt template
        self.extraction_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert KYC document extractor. 
Extract the following information from the ID document (Passport, Driving License, etc.):
- first_name
- last_name
- dob (YYYY-MM-DD format)
- id_number
- document_type (e.g., PASSPORT, DRIVING_LICENSE, ID_CARD)
- expiry_date (YYYY-MM-DD format, if available)

Return ONLY valid JSON. No markdown, no explanations.
{format_instructions}"""),
            ("human", "{input}")
        ])
        
        # Review prompt template
        self.review_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a REVIEWER AGENT performing quality control.

Another AI extracted this data from a KYC document:
{extracted_data}

Your job:
1. Review the document image again
2. Verify if the extracted data is ACCURATE
3. Identify any MISTAKES or MISSING fields
4. Provide CORRECTIONS if needed

Return ONLY valid JSON with this structure:
{{
    "review_status": "APPROVED" or "NEEDS_CORRECTION",
    "confidence_score": 0.0-1.0,
    "corrections": {{"field_name": "corrected_value"}},
    "issues_found": ["issue1", "issue2"],
    "reviewer_notes": "any observations"
}}

If everything is correct, return APPROVED with empty corrections.
{format_instructions}"""),
            ("human", "{input}")
        ])
    
    def _encode_image(self, image_path: str) -> str:
        """Encode image to base64 for OpenAI."""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def _prepare_image_message(self, file_path: str, text: str) -> HumanMessage:
        """Prepare message with image for LLM."""
        import mimetypes
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            if file_path.lower().endswith('.pdf'):
                mime_type = 'application/pdf'
            elif file_path.lower().endswith(('.png', '.jpg', '.jpeg')):
                mime_type = 'image/jpeg'
        
        if self.provider == "gemini":
            # Gemini accepts file paths directly
            import google.generativeai as genai
            uploaded_file = genai.upload_file(file_path, mime_type=mime_type)
            return HumanMessage(
                content=[
                    {"type": "text", "text": text},
                    {"type": "image_url", "image_url": uploaded_file.uri}
                ]
            )
        else:
            # OpenAI needs base64
            base64_image = self._encode_image(file_path)
            return HumanMessage(
                content=[
                    {"type": "text", "text": text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                    }
                ]
            )
    
    def extract_data(self, file_path: str) -> Optional[Dict]:
        """
        Extract ALL available KYC data from document using LangChain.
        Uses flexible extraction to capture any fields present.
        """
        try:
            # Flexible extraction prompt - captures EVERYTHING
            prompt_text = """You are an expert document data extractor.

TASK: Extract ALL information from this identity document (Passport, License, ID Card, etc.).

IMPORTANT: Extract EVERY field you can see, not just common ones. Be comprehensive.

Common fields to look for (but not limited to):
- Personal: first_name, middle_name, last_name, full_name, maiden_name
- Dates: dob (date of birth), issue_date, expiry_date
- Identity: id_number, passport_number, license_number, national_id
- Document: document_type, document_number, issuing_authority, country_code
- Physical: sex/gender, height, weight, eye_color, hair_color, blood_type
- Address: address, city, state, postal_code, country
- Other: nationality, place_of_birth, signature_present, photo_present, mrz_code

Return ALL fields you find as JSON. Use snake_case for field names.
If a field is not present, omit it (don't include null values).
Format dates as YYYY-MM-DD.

Example output structure (extract what you actually see):
{
    "document_type": "PASSPORT",
    "first_name": "JOHN",
    "last_name": "DOE",
    "dob": "1990-01-01",
    "passport_number": "A12345678",
    "nationality": "USA",
    "sex": "M",
    "place_of_birth": "New York",
    "issue_date": "2020-01-01",
    "expiry_date": "2030-01-01",
    "issuing_authority": "U.S. Department of State"
}

Return ONLY valid JSON. No markdown, no explanations."""
            
            # Encode image to base64
            base64_image = self._encode_image(file_path)
            
            # Get mime type
            import mimetypes
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = 'image/jpeg'
            
            # Create message with image
            message = HumanMessage(
                content=[
                    {"type": "text", "text": prompt_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                    }
                ]
            )
            
            # Invoke LLM
            response = self.llm.invoke([message])
            
            # Parse response
            text = response.content.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            
            extracted = json.loads(text.strip())
            
            # Normalize field names for consistency
            normalized = self._normalize_fields(extracted)
            
            return normalized
            
        except Exception as e:
            print(f"LangChain extraction error: {e}")
            return None
    
    def _normalize_fields(self, data: Dict) -> Dict:
        """
        Normalize field names for consistency across different document types.
        """
        # Create aliases for common variations
        field_aliases = {
            'passport_number': 'id_number',
            'license_number': 'id_number',
            'national_id': 'id_number',
            'document_number': 'id_number',
            'given_name': 'first_name',
            'given_names': 'first_name',
            'surname': 'last_name',
            'family_name': 'last_name',
            'date_of_birth': 'dob',
            'birth_date': 'dob',
        }
        
        normalized = data.copy()
        
        # Apply aliases (keep original + add normalized version)
        for original_key, normalized_key in field_aliases.items():
            if original_key in normalized and normalized_key not in normalized:
                normalized[normalized_key] = normalized[original_key]
        
        return normalized
    
    def review_extraction(self, file_path: str, extracted_data: Dict) -> Dict:
        """
        Review extraction using LangChain.
        """
        try:
            review_text = f"""You are a REVIEWER AGENT performing quality control.

Another AI extracted this data from a KYC document:
{json.dumps(extracted_data, indent=2)}

Review the document and verify accuracy. Return JSON:
{{
    "review_status": "APPROVED" or "NEEDS_CORRECTION",
    "confidence_score": 0.0-1.0,
    "corrections": {{"field_name": "corrected_value"}},
    "issues_found": ["issue1"],
    "reviewer_notes": "notes"
}}"""
            
            # Encode image
            base64_image = self._encode_image(file_path)
            
            # Get mime type
            import mimetypes
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = 'image/jpeg'
            
            # Create message
            message = HumanMessage(
                content=[
                    {"type": "text", "text": review_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                    }
                ]
            )
            
            # Invoke LLM
            response = self.llm.invoke([message])
            
            # Parse response
            text = response.content.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            
            review_result = json.loads(text.strip())
            
            # Apply corrections
            if review_result.get("review_status") == "NEEDS_CORRECTION":
                corrected_data = extracted_data.copy()
                for field, value in review_result.get("corrections", {}).items():
                    if field in corrected_data:
                        corrected_data[field] = value
                
                return {
                    "final_data": corrected_data,
                    "review_result": review_result,
                    "was_corrected": True
                }
            else:
                return {
                    "final_data": extracted_data,
                    "review_result": review_result,
                    "was_corrected": False
                }
                
        except Exception as e:
            print(f"LangChain review error: {e}")
            return {
                "final_data": extracted_data,
                "review_result": {"review_status": "ERROR", "error": str(e)},
                "was_corrected": False
            }
