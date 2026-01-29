"""API endpoints for customer data."""

import json
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/customers", tags=["customers"])

# Path to customer database
CUSTOMER_DB_PATH = os.path.join(os.path.dirname(__file__), "../../../customer_db.json")


class Customer(BaseModel):
    """Customer schema."""
    customer_id: str
    first_name: str
    last_name: str
    dob: str
    id_number: str
    document_type: str
    email: Optional[str] = None
    phone: Optional[str] = None


def load_customers() -> List[dict]:
    """Load customers from JSON database."""
    # Try multiple paths
    paths_to_try = [
        CUSTOMER_DB_PATH,
        "customer_db.json",
        "../customer_db.json",
        os.path.join(os.getcwd(), "customer_db.json"),
    ]
    
    for path in paths_to_try:
        if os.path.exists(path):
            with open(path, 'r') as f:
                return json.load(f)
    
    return []


@router.get("", response_model=List[Customer])
async def list_customers():
    """List all customers from the database."""
    customers = load_customers()
    return customers


@router.get("/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str):
    """Get a specific customer by ID."""
    customers = load_customers()
    
    for customer in customers:
        if customer.get("customer_id") == customer_id:
            return customer
    
    raise HTTPException(status_code=404, detail="Customer not found")
