import os
import glob
from dotenv import load_dotenv
from agent import InvoiceAgent
from kyc_verifier import KYCVerifier, generate_kyc_report
from audit_logger import AuditLogger
from reviewer_agent import ReviewerAgent

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

    # Initialize Agent
    try:
        # Change provider to 'gemini' if you want to switch back
        agent = InvoiceAgent(provider="gemini")
    except ValueError as e:
        print(f"Error: {e}")
        return

    # Initialize Verifier, Audit Logger, and Reviewer Agent
    try:
        verifier = KYCVerifier()
        audit = AuditLogger()
        reviewer = ReviewerAgent(agent)
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
        print(f"Processing {file_path}...")
        
        # Log: Document received
        audit.log_step(
            step_name="Document Received",
            details=f"Processing document: {os.path.basename(file_path)}",
            document_path=file_path
        )
        
        data = agent.extract_data(file_path)
        
        if data:
            print("  -> Extraction Success")
            
            # Log: Data extracted
            audit.log_step(
                step_name="Data Extraction",
                details="Successfully extracted data from document using AI",
                document_path=file_path,
                extracted_data=data
            )
            
            # REVIEWER AGENT: Double-check the extraction
            review_result = reviewer.review_extraction(file_path, data)
            final_data = review_result["final_data"]
            
            # Log: Review complete
            audit.log_step(
                step_name="Quality Review",
                details=f"Reviewer Agent: {reviewer.get_review_summary(review_result)}",
                document_path=file_path,
                extracted_data=final_data,
                verification_result=review_result["review_result"]
            )
            
            # Verify using the REVIEWED/CORRECTED data
            report = verifier.verify(final_data)
            print(f"  -> Verification Status: {report['status']}")
            
            # Log: Verification complete
            audit.log_step(
                step_name="Verification Complete",
                details=f"Compared extracted data against internal database",
                document_path=file_path,
                extracted_data=final_data,
                verification_result=report
            )
            
            reports.append(report)
        else:
            print("  -> Failed to extract data")
            failed_report = {"status": "FAILED", "reason": "Extraction failed", "file": os.path.basename(file_path)}
            
            # Log: Extraction failed
            audit.log_step(
                step_name="Extraction Failed",
                details="AI failed to extract data from document",
                document_path=file_path,
                verification_result=failed_report
            )
            
            reports.append(failed_report)

    # Generate Report
    if reports:
        generate_kyc_report(reports, OUTPUT_FILE)
    else:
        print("No reports generated.")
    
    # Save audit trail
    audit.save_audit_report()

if __name__ == "__main__":
    main()
