import os
import json
import shutil
from datetime import datetime
from PIL import Image

class AuditLogger:
    def __init__(self, output_dir="audit_logs"):
        self.output_dir = output_dir
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_dir = os.path.join(output_dir, self.session_id)
        os.makedirs(self.session_dir, exist_ok=True)
        
        self.audit_trail = []
        self.step_counter = 0
        
    def log_step(self, step_name, details, document_path=None, extracted_data=None, verification_result=None):
        """
        Logs a single step in the verification process.
        """
        self.step_counter += 1
        
        step_data = {
            "step_number": self.step_counter,
            "timestamp": datetime.now().isoformat(),
            "step_name": step_name,
            "details": details,
            "document_file": os.path.basename(document_path) if document_path else None,
            "extracted_data": extracted_data,
            "verification_result": verification_result
        }
        
        # Copy document screenshot to audit folder
        if document_path and os.path.exists(document_path):
            screenshot_name = f"step_{self.step_counter:03d}_{os.path.basename(document_path)}"
            screenshot_path = os.path.join(self.session_dir, screenshot_name)
            shutil.copy2(document_path, screenshot_path)
            step_data["screenshot"] = screenshot_name
            
            # Create thumbnail for quick review
            try:
                img = Image.open(document_path)
                img.thumbnail((300, 300))
                thumb_name = f"thumb_{screenshot_name}"
                img.save(os.path.join(self.session_dir, thumb_name))
                step_data["thumbnail"] = thumb_name
            except:
                pass
        
        self.audit_trail.append(step_data)
        
    def save_audit_report(self):
        """
        Saves the complete audit trail to a JSON file.
        """
        report_path = os.path.join(self.session_dir, "audit_report.json")
        
        summary = {
            "session_id": self.session_id,
            "total_steps": self.step_counter,
            "session_start": self.audit_trail[0]["timestamp"] if self.audit_trail else None,
            "session_end": datetime.now().isoformat(),
            "steps": self.audit_trail
        }
        
        with open(report_path, 'w') as f:
            json.dump(summary, f, indent=2)
        
        print(f"\n📋 Audit Report saved to: {report_path}")
        print(f"📁 Review folder: {self.session_dir}")
        
        # Generate HTML report for easy viewing
        self._generate_html_report()
        
    def _generate_html_report(self):
        """
        Generates a human-readable HTML report.
        """
        html_path = os.path.join(self.session_dir, "audit_report.html")
        
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>KYC Audit Report - {self.session_id}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        .header {{ background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }}
        .step {{ background: white; margin: 20px 0; padding: 20px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .step-header {{ font-size: 18px; font-weight: bold; margin-bottom: 10px; }}
        .verified {{ color: #27ae60; }}
        .flagged {{ color: #e74c3c; }}
        .failed {{ color: #95a5a6; }}
        .screenshot {{ max-width: 400px; border: 1px solid #ddd; margin: 10px 0; }}
        .data-box {{ background: #ecf0f1; padding: 10px; border-radius: 3px; font-family: monospace; font-size: 12px; }}
        .timestamp {{ color: #7f8c8d; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 KYC Verification Audit Report</h1>
        <p>Session ID: {self.session_id}</p>
        <p>Total Steps: {self.step_counter}</p>
    </div>
"""
        
        for step in self.audit_trail:
            status_class = ""
            if step.get("verification_result"):
                status = step["verification_result"].get("status", "")
                status_class = status.lower()
            
            html += f"""
    <div class="step">
        <div class="step-header">Step {step['step_number']}: {step['step_name']}</div>
        <div class="timestamp">{step['timestamp']}</div>
        <p>{step['details']}</p>
"""
            
            if step.get("screenshot"):
                html += f'<img src="{step["screenshot"]}" class="screenshot" alt="Document Screenshot"><br>'
            
            if step.get("extracted_data"):
                html += f"""
        <strong>Extracted Data:</strong>
        <div class="data-box">{json.dumps(step['extracted_data'], indent=2)}</div>
"""
            
            if step.get("verification_result"):
                result = step["verification_result"]
                html += f"""
        <strong>Verification Result:</strong>
        <div class="data-box {status_class}">
            <strong>Status:</strong> {result.get('status', 'N/A')}<br>
"""
                if result.get('discrepancies'):
                    html += f"<strong>Discrepancies:</strong> {result['discrepancies']}<br>"
                if result.get('customer_id'):
                    html += f"<strong>Customer ID:</strong> {result['customer_id']}<br>"
                
                html += "</div>"
            
            html += "</div>\n"
        
        html += """
</body>
</html>
"""
        
        with open(html_path, 'w') as f:
            f.write(html)
        
        print(f"🌐 HTML Report: {html_path}")
