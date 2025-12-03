import os
import shutil
from unittest.mock import MagicMock, patch
from agent import InvoiceAgent
from main import main

def test_pipeline_mock():
    print("--- Starting Mock Pipeline Test ---")
    
    # Mock the InvoiceAgent to avoid API calls
    with patch('agent.InvoiceAgent') as MockAgent:
        # Setup the mock instance
        mock_instance = MockAgent.return_value
        
        # Define what extract_data should return
        mock_instance.extract_data.return_value = {
            "invoice_number": "MOCK-001",
            "date": "2024-12-04",
            "vendor": "Mock Vendor Inc",
            "total_amount": 123.45,
            "currency": "USD",
            "items": [
                {"name": "Mock Item 1", "quantity": 1, "unit_price": 100.0, "total": 100.0},
                {"name": "Mock Item 2", "quantity": 2, "unit_price": 11.725, "total": 23.45}
            ]
        }
        
        print("1. Mocking Gemini API... Done")
        
        # Run the main function
        print("2. Running main() with mock agent...")
        # We need to ensure main.py uses our mock. 
        # Since main.py imports InvoiceAgent, we need to patch it where it's imported.
        with patch('main.InvoiceAgent', MockAgent):
            main()
            
    print("3. Checking output...")
    if os.path.exists("output/report.xlsx"):
        print("SUCCESS: output/report.xlsx was created!")
    else:
        print("FAILURE: output/report.xlsx was NOT created.")
        
    print("--- Mock Test Complete ---")

if __name__ == "__main__":
    test_pipeline_mock()
