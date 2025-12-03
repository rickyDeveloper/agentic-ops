import os
import json
import base64
import mimetypes
import google.generativeai as genai
from openai import OpenAI

class InvoiceAgent:
    def __init__(self, provider: str = "openai"):
        self.provider = provider.lower()
        
        if self.provider == "gemini":
            self.api_key = os.getenv("GEMINI_API_KEY")
            if not self.api_key:
                raise ValueError("GEMINI_API_KEY not found.")
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel('gemini-2.0-flash')
            
        elif self.provider == "openai":
            self.api_key = os.getenv("OPENAI_API_KEY")
            if not self.api_key:
                raise ValueError("OPENAI_API_KEY not found.")
            self.client = OpenAI(api_key=self.api_key)
            self.model = "gpt-4o-mini"
            
        else:
            raise ValueError("Invalid provider. Choose 'gemini' or 'openai'.")

    def _encode_image(self, image_path):
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')

    def extract_data(self, file_path: str) -> dict:
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
             if file_path.lower().endswith('.pdf'): mime_type = 'application/pdf'
             elif file_path.lower().endswith(('.png', '.jpg', '.jpeg')): mime_type = 'image/jpeg'
        
        prompt_text = """
        You are an expert KYC document extractor. 
        Please extract the following information from the ID document (Passport, Driving License, etc.):
        1. First Name
        2. Last Name
        3. Date of Birth (YYYY-MM-DD format)
        4. ID Number (Passport No, License No, etc.)
        5. Document Type (e.g., PASSPORT, DRIVING_LICENSE, ID_CARD)
        6. Expiry Date (YYYY-MM-DD format) - if available

        Return strict JSON. No markdown.
        Structure:
        {
            "first_name": "...",
            "last_name": "...",
            "dob": "...",
            "id_number": "...",
            "document_type": "...",
            "expiry_date": "..."
        }
        """

        try:
            if self.provider == "gemini":
                uploaded_file = genai.upload_file(file_path, mime_type=mime_type)
                response = self.model.generate_content([prompt_text, uploaded_file])
                text = response.text
                
            elif self.provider == "openai":
                # OpenAI handles images via base64 in the user message content
                base64_image = self._encode_image(file_path)
                
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt_text},
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

            # Clean JSON
            text = text.strip()
            if text.startswith("```json"): text = text[7:]
            if text.endswith("```"): text = text[:-3]
            return json.loads(text)

        except Exception as e:
            print(f"Error processing {file_path} with {self.provider}: {e}")
            return None
