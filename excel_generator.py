import pandas as pd
import os

def generate_excel_report(data_list: list, output_path: str):
    """
    Generates an Excel report from a list of invoice data dictionaries.
    """
    if not data_list:
        print("No data to write to Excel.")
        return

    # Flatten data for main sheet (one row per invoice)
    # We might want a separate sheet for line items if needed, 
    # but for now let's keep it simple: One row per invoice. 
    # Or maybe we flatten items? Let's do a main summary sheet.
    
    summary_data = []
    all_items = []

    for entry in data_list:
        if not entry:
            continue
            
        # Summary row
        summary_data.append({
            "Invoice Number": entry.get("invoice_number"),
            "Date": entry.get("date"),
            "Vendor": entry.get("vendor"),
            "Total Amount": entry.get("total_amount"),
            "Currency": entry.get("currency")
        })

        # Items rows (linked by invoice number)
        for item in entry.get("items", []):
            item_row = item.copy()
            item_row["Invoice Number"] = entry.get("invoice_number")
            all_items.append(item_row)

    df_summary = pd.DataFrame(summary_data)
    df_items = pd.DataFrame(all_items)

    # Reorder columns for better readability if possible
    # (Pandas defaults are usually okay, but let's ensure Invoice Number is first)
    
    try:
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            df_summary.to_excel(writer, sheet_name='Invoices', index=False)
            df_items.to_excel(writer, sheet_name='Line Items', index=False)
        print(f"Report generated successfully at {output_path}")
    except Exception as e:
        print(f"Error generating Excel report: {e}")
