import os
import json
from typing import Dict, Optional

class ReviewerAgent:
    """
    A secondary agent that reviews the primary agent's extraction results.
    Acts as a quality control layer to catch and correct mistakes.
    """
    
    def __init__(self, primary_agent):
        self.primary_agent = primary_agent
        self.review_prompt = """
        You are a REVIEWER AGENT performing quality control on data extraction.
        
        Another AI agent extracted the following data from a KYC document:
        {extracted_data}
        
        Your job is to:
        1. Review the document image again
        2. Verify if the extracted data is ACCURATE
        3. Identify any MISTAKES or MISSING fields
        4. Provide CORRECTIONS if needed
        
        Return your review as JSON with this structure:
        {{
            "review_status": "APPROVED" or "NEEDS_CORRECTION",
            "confidence_score": 0.0-1.0,
            "corrections": {{
                "field_name": "corrected_value"
            }},
            "issues_found": [
                "Description of issue 1",
                "Description of issue 2"
            ],
            "reviewer_notes": "Any additional observations"
        }}
        
        If everything is correct, return "APPROVED" with empty corrections.
        If you find mistakes, return "NEEDS_CORRECTION" with the corrected values.
        """
    
    def review_extraction(self, file_path: str, primary_extraction: Dict) -> Dict:
        """
        Reviews the primary agent's extraction and provides corrections if needed.
        """
        print(f"  🔍 Reviewer Agent: Double-checking extraction...")
        
        # Prepare the review prompt with the primary extraction
        review_prompt = self.review_prompt.format(
            extracted_data=json.dumps(primary_extraction, indent=2)
        )
        
        # Get the mime type
        import mimetypes
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            if file_path.lower().endswith('.pdf'):
                mime_type = 'application/pdf'
            elif file_path.lower().endswith(('.png', '.jpg', '.jpeg')):
                mime_type = 'image/jpeg'
        
        try:
            # Use the same provider as primary agent
            if self.primary_agent.provider == "gemini":
                import google.generativeai as genai
                uploaded_file = genai.upload_file(file_path, mime_type=mime_type)
                response = self.primary_agent.model.generate_content([review_prompt, uploaded_file])
                text = response.text
                
            elif self.primary_agent.provider == "openai":
                base64_image = self.primary_agent._encode_image(file_path)
                response = self.primary_agent.client.chat.completions.create(
                    model=self.primary_agent.model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": review_prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ],
                    response_format={"type": "json_object"}
                )
                text = response.choices[0].message.content
            
            # Clean and parse JSON
            text = text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            
            review_result = json.loads(text)
            
            # Apply corrections if needed
            if review_result.get("review_status") == "NEEDS_CORRECTION":
                print(f"  ⚠️  Reviewer found issues: {', '.join(review_result.get('issues_found', []))}")
                
                # Apply corrections
                corrected_data = primary_extraction.copy()
                for field, corrected_value in review_result.get("corrections", {}).items():
                    if field in corrected_data:
                        print(f"  ✏️  Correcting {field}: '{corrected_data[field]}' → '{corrected_value}'")
                        corrected_data[field] = corrected_value
                
                return {
                    "final_data": corrected_data,
                    "review_result": review_result,
                    "was_corrected": True
                }
            else:
                print(f"  ✅ Reviewer approved extraction (confidence: {review_result.get('confidence_score', 'N/A')})")
                return {
                    "final_data": primary_extraction,
                    "review_result": review_result,
                    "was_corrected": False
                }
                
        except Exception as e:
            print(f"  ⚠️  Reviewer Agent error: {e}")
            # Fallback: return original extraction
            return {
                "final_data": primary_extraction,
                "review_result": {"review_status": "ERROR", "error": str(e)},
                "was_corrected": False
            }
    
    def get_review_summary(self, review_result: Dict) -> str:
        """
        Generates a human-readable summary of the review.
        """
        if review_result.get("was_corrected"):
            issues = review_result["review_result"].get("issues_found", [])
            return f"CORRECTED - Issues: {'; '.join(issues)}"
        elif review_result["review_result"].get("review_status") == "APPROVED":
            confidence = review_result["review_result"].get("confidence_score", "N/A")
            return f"APPROVED - Confidence: {confidence}"
        else:
            return "ERROR - Review failed"
