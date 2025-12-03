import json
import pandas as pd
from typing import List, Dict

class KYCVerifier:
    def __init__(self, db_path: str = "customer_db.json"):
        with open(db_path, 'r') as f:
            self.db = json.load(f)
        # Index DB by ID Number for easy lookup (in real world, maybe fuzzy match on name too)
        self.db_index = {record['id_number']: record for record in self.db}

    def verify(self, extracted_data: Dict) -> Dict:
        """
        Compares extracted data against the internal database.
        Returns a report with status and discrepancies.
        """
        if not extracted_data:
            return {"status": "FAILED", "reason": "No data extracted"}

        id_number = extracted_data.get("id_number")
        if not id_number:
            return {"status": "FLAGGED", "reason": "ID Number not found in document"}

        # Normalize ID for lookup
        id_number = id_number.upper().strip()
        
        record = self.db_index.get(id_number)
        if not record:
            return {"status": "FLAGGED", "reason": f"ID {id_number} not found in internal DB"}

        discrepancies = []
        
        # Compare Fields (Case insensitive for strings)
        fields_to_check = ["first_name", "last_name", "dob", "document_type"]
        
        for field in fields_to_check:
            extracted_val = str(extracted_data.get(field, "")).upper().strip()
            db_val = str(record.get(field, "")).upper().strip()
            
            if extracted_val != db_val:
                discrepancies.append(f"{field.upper()} mismatch: Doc='{extracted_val}' vs DB='{db_val}'")

        if discrepancies:
            return {
                "status": "FLAGGED",
                "customer_id": record.get("customer_id"),
                "discrepancies": "; ".join(discrepancies),
                "extracted": extracted_data,
                "internal": record
            }
        else:
            return {
                "status": "VERIFIED",
                "customer_id": record.get("customer_id"),
                "details": "All fields match"
            }

def generate_kyc_report(reports: List[Dict], output_path: str):
    """
    Generates an Excel report for KYC verification.
    """
    if not reports:
        print("No reports to generate.")
        return

    # Flatten for Excel
    rows = []
    for r in reports:
        row = {
            "Status": r.get("status"),
            "Reason/Discrepancies": r.get("reason") or r.get("discrepancies"),
            "Customer ID": r.get("customer_id", "N/A"),
        }
        # Add extracted data details if available
        if "extracted" in r:
            for k, v in r["extracted"].items():
                row[f"Doc_{k}"] = v
        
        rows.append(row)

    df = pd.DataFrame(rows)
    df.to_excel(output_path, index=False)
    print(f"KYC Report generated at {output_path}")
