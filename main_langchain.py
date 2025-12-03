import os
import glob
from dotenv import load_dotenv
from langchain_agent import LangChainKYCAgent
from kyc_verifier import KYCVerifier, generate_kyc_report
from audit_logger import AuditLogger

# Load environment variables
load_dotenv()

def main():
    # Configuration
    INPUT_DIR = "documents"
    OUTPUT_DIR = "output"
    OUTPUT_FILE = os.path.join(OUTPUT_DIR, "kyc_report.xlsx")
    
    # Ensure directories exist
    os.makedirs(INPUT_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Initialize LangChain Agent
    try:
        print("🔗 Initializing LangChain KYC Agent...")
        agent = LangChainKYCAgent(provider="gemini")
        print("✅ LangChain agent ready!")
    except ValueError as e:
        print(f"Error: {e}")
        return

    # Initialize Verifier and Audit Logger
    try:
        verifier = KYCVerifier()
        audit = AuditLogger()
    except FileNotFoundError:
        print("Error: customer_db.json not found.")
        return

    # Find all files in input directory
    extensions = ['*.pdf', '*.jpg', '*.jpeg', '*.png', '*.PDF', '*.JPG', '*.JPEG', '*.PNG']
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(INPUT_DIR, ext)))
    
    if not files:
        print(f"No document files found in {INPUT_DIR}. Please add some files and try again.")
        return

    print(f"Found {len(files)} files to process.")
    
    reports = []
    
    for file_path in files:
        print(f"\n{'='*60}")
        print(f"Processing {file_path}...")
        print(f"{'='*60}")
        
        # Log: Document received
        audit.log_step(
            step_name="Document Received",
            details=f"Processing document: {os.path.basename(file_path)}",
            document_path=file_path
        )
        
        # PRIMARY AGENT: Extract using LangChain
        print("📄 Step 1: Extracting data with LangChain...")
        data = agent.extract_data(file_path)
        
        if data:
            print("  ✅ Extraction Success")
            print(f"  📊 Extracted: {json.dumps(data, indent=2)}")
            
            # Log: Data extracted
            audit.log_step(
                step_name="LangChain Extraction",
                details="Successfully extracted data using LangChain agent",
                document_path=file_path,
                extracted_data=data
            )
            
            # REVIEWER: Quality check using LangChain
            print("\n🔍 Step 2: Quality review with LangChain...")
            review_result = agent.review_extraction(file_path, data)
            final_data = review_result["final_data"]
            
            if review_result["was_corrected"]:
                print("  ⚠️  Corrections applied!")
            else:
                print(f"  ✅ Approved (confidence: {review_result['review_result'].get('confidence_score', 'N/A')})")
            
            # Log: Review complete
            audit.log_step(
                step_name="LangChain Quality Review",
                details=f"Review status: {review_result['review_result'].get('review_status')}",
                document_path=file_path,
                extracted_data=final_data,
                verification_result=review_result["review_result"]
            )
            
            # VERIFY: Compare against database
            print("\n🔐 Step 3: Verifying against database...")
            report = verifier.verify(final_data)
            print(f"  → Verification Status: {report['status']}")
            
            # Log: Verification complete
            audit.log_step(
                step_name="Database Verification",
                details=f"Compared against internal customer database",
                document_path=file_path,
                extracted_data=final_data,
                verification_result=report
            )
            
            reports.append(report)
        else:
            print("  ❌ Failed to extract data")
            failed_report = {"status": "FAILED", "reason": "Extraction failed", "file": os.path.basename(file_path)}
            
            # Log: Extraction failed
            audit.log_step(
                step_name="Extraction Failed",
                details="LangChain agent failed to extract data",
                document_path=file_path,
                verification_result=failed_report
            )
            
            reports.append(failed_report)

    # Generate Report
    print(f"\n{'='*60}")
    print("📊 Generating final reports...")
    print(f"{'='*60}")
    
    if reports:
        generate_kyc_report(reports, OUTPUT_FILE)
    else:
        print("No reports generated.")
    
    # Save audit trail
    audit.save_audit_report()
    
    print(f"\n✅ Processing complete!")
    print(f"📄 KYC Report: {OUTPUT_FILE}")

if __name__ == "__main__":
    import json
    main()
