from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import secrets
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import gspread
from google.oauth2.service_account import Credentials

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'class_one_savings')]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'default-secret-change-in-production')
JWT_ALGORITHM = "HS256"

# Google Sheets Configuration
SPREADSHEET_ID = os.environ.get('GOOGLE_SPREADSHEET_ID')
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

# Create the main app
app = FastAPI(title="Class One Savings API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== PYDANTIC MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    phone: Optional[str] = None
    role: str  # super_admin, admin, member
    membership_type: str  # premium, ordinary
    total_savings: float = 0
    created_at: str

class DepositRequest(BaseModel):
    amount: float
    description: Optional[str] = None

class LoanRequest(BaseModel):
    amount: float
    reason: Optional[str] = None

class WithdrawalRequest(BaseModel):
    amount: float
    reason: Optional[str] = None

class RoleUpdate(BaseModel):
    user_id: str
    new_role: str  # admin or member

class MembershipUpdate(BaseModel):
    user_id: str
    membership_type: str  # premium or ordinary

class TransactionApproval(BaseModel):
    transaction_id: str
    approved: bool
    notes: Optional[str] = None

# ==================== PASSWORD HASHING ====================

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# ==================== JWT TOKEN MANAGEMENT ====================

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ==================== AUTH HELPER ====================

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def require_super_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return user

# ==================== GOOGLE SHEETS SYNC (ENHANCED AUTO-SYNC) ====================

# Sheet configuration registry - automatically manages all data types
SHEET_REGISTRY = {
    "Members": {
        "collection": "users",
        "exclude_fields": ["password_hash", "_id"],
        "column_order": ["email", "name", "phone", "role", "membership_type", "total_savings", "created_at"]
    },
    "Deposits": {
        "collection": "deposits",
        "exclude_fields": ["_id"],
        "column_order": ["user_name", "user_email", "amount", "description", "status", "created_at", "approved_at", "approved_by", "notes"]
    },
    "Loans": {
        "collection": "loans",
        "exclude_fields": ["_id"],
        "column_order": ["user_name", "user_email", "amount", "reason", "status", "repaid", "created_at", "approved_at", "approved_by", "notes"]
    },
    "Withdrawals": {
        "collection": "withdrawals",
        "exclude_fields": ["_id"],
        "column_order": ["user_name", "user_email", "amount", "reason", "status", "created_at", "approved_at", "approved_by", "notes"]
    },
    "Activity_Log": {
        "collection": "activity_log",
        "exclude_fields": ["_id"],
        "column_order": ["timestamp", "user_email", "action", "details", "ip_address"]
    },
    "Group_Stats": {
        "collection": None,  # Computed, not from collection
        "exclude_fields": [],
        "column_order": ["date", "total_members", "premium_members", "ordinary_members", "total_savings", "total_deposits", "total_withdrawals", "active_loans"]
    }
}

def get_sheets_client():
    try:
        creds_info = {
            "type": "service_account",
            "project_id": os.environ.get('GOOGLE_PROJECT_ID'),
            "private_key_id": os.environ.get('GOOGLE_PRIVATE_KEY_ID'),
            "private_key": os.environ.get('GOOGLE_PRIVATE_KEY', '').replace('\\n', '\n'),
            "client_email": os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
            "client_id": os.environ.get('GOOGLE_CLIENT_ID'),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '').replace('@', '%40')}"
        }
        credentials = Credentials.from_service_account_info(creds_info, scopes=SCOPES)
        gc = gspread.authorize(credentials)
        return gc
    except Exception as e:
        logger.error(f"Failed to connect to Google Sheets: {e}")
        return None

def get_or_create_worksheet(spreadsheet, sheet_name: str, rows: int = 1000, cols: int = 30):
    """Get existing worksheet or create new one with proper sizing"""
    try:
        worksheet = spreadsheet.worksheet(sheet_name)
        # Expand if needed
        current_rows = worksheet.row_count
        current_cols = worksheet.col_count
        if current_rows < rows or current_cols < cols:
            worksheet.resize(rows=max(current_rows, rows), cols=max(current_cols, cols))
        return worksheet
    except gspread.exceptions.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=rows, cols=cols)
        logger.info(f"Created new worksheet: {sheet_name}")
        return worksheet

def extract_all_columns(data: list, predefined_order: list = None) -> list:
    """Extract all unique columns from data, preserving order and adding new ones"""
    all_columns = set()
    for row in data:
        all_columns.update(row.keys())
    
    # Start with predefined order if provided
    if predefined_order:
        ordered = [col for col in predefined_order if col in all_columns]
        # Add any new columns not in predefined order
        new_cols = sorted([col for col in all_columns if col not in predefined_order])
        ordered.extend(new_cols)
        return ordered
    
    return sorted(list(all_columns))

def serialize_value(value) -> str:
    """Serialize any value to string for sheets"""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (list, dict)):
        return str(value)
    return str(value)

async def sync_to_sheets(sheet_name: str, data: list, append_mode: bool = False):
    """
    Enhanced sync to Google Sheets with auto-column detection
    
    Args:
        sheet_name: Name of the worksheet
        data: List of dictionaries to sync
        append_mode: If True, append rows instead of replacing all data
    """
    try:
        gc = get_sheets_client()
        if not gc:
            logger.warning("Google Sheets client not available")
            return False
        
        try:
            spreadsheet = gc.open_by_key(SPREADSHEET_ID)
        except gspread.exceptions.APIError as e:
            if "403" in str(e) or "permission" in str(e).lower():
                logger.error(f"Permission denied accessing spreadsheet. Please share the spreadsheet with: {os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')}")
            raise
        
        # Get or create worksheet
        worksheet = get_or_create_worksheet(spreadsheet, sheet_name)
        
        if not data:
            logger.info(f"No data to sync to {sheet_name}")
            return True
        
        # Get column order from registry if available
        config = SHEET_REGISTRY.get(sheet_name, {})
        predefined_order = config.get("column_order", [])
        exclude_fields = config.get("exclude_fields", ["_id", "password_hash"])
        
        # Filter excluded fields from data
        filtered_data = []
        for row in data:
            filtered_row = {k: v for k, v in row.items() if k not in exclude_fields}
            filtered_data.append(filtered_row)
        
        # Extract all columns (including new ones)
        headers = extract_all_columns(filtered_data, predefined_order)
        
        if append_mode:
            # Get existing headers
            existing_headers = worksheet.row_values(1) if worksheet.row_count > 0 else []
            
            # Merge headers (add new columns)
            new_headers = [h for h in headers if h not in existing_headers]
            if new_headers:
                all_headers = existing_headers + new_headers
                # Update header row
                worksheet.update('A1', [all_headers])
                headers = all_headers
                logger.info(f"Added new columns to {sheet_name}: {new_headers}")
            else:
                headers = existing_headers if existing_headers else headers
            
            # Append new rows
            rows_to_append = [[serialize_value(row.get(h, '')) for h in headers] for row in filtered_data]
            if rows_to_append:
                worksheet.append_rows(rows_to_append)
        else:
            # Full replace mode
            worksheet.clear()
            
            # Prepare all rows
            all_rows = [headers]  # Header row
            for row in filtered_data:
                row_values = [serialize_value(row.get(h, '')) for h in headers]
                all_rows.append(row_values)
            
            # Batch update for efficiency
            worksheet.update('A1', all_rows)
        
        logger.info(f"Synced {len(filtered_data)} rows with {len(headers)} columns to {sheet_name}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to sync to sheets ({sheet_name}): {e}")
        return False

async def append_single_row(sheet_name: str, row_data: dict):
    """Append a single row to a sheet (for real-time logging)"""
    try:
        gc = get_sheets_client()
        if not gc:
            return False
        
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
        worksheet = get_or_create_worksheet(spreadsheet, sheet_name)
        
        # Get or create headers
        existing_headers = worksheet.row_values(1) if worksheet.row_count > 0 else []
        
        config = SHEET_REGISTRY.get(sheet_name, {})
        predefined_order = config.get("column_order", [])
        
        if not existing_headers:
            # Create headers from row data and predefined order
            headers = extract_all_columns([row_data], predefined_order)
            worksheet.update('A1', [headers])
            existing_headers = headers
        
        # Check for new columns in row_data
        new_cols = [k for k in row_data.keys() if k not in existing_headers and k not in config.get("exclude_fields", [])]
        if new_cols:
            existing_headers.extend(new_cols)
            worksheet.update('A1', [existing_headers])
            logger.info(f"Added new columns to {sheet_name}: {new_cols}")
        
        # Append the row
        row_values = [serialize_value(row_data.get(h, '')) for h in existing_headers]
        worksheet.append_row(row_values)
        
        return True
    except Exception as e:
        logger.error(f"Failed to append row to {sheet_name}: {e}")
        return False

async def log_activity(user_email: str, action: str, details: str = "", ip_address: str = ""):
    """Log activity to both MongoDB and Google Sheets"""
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_email": user_email,
        "action": action,
        "details": details,
        "ip_address": ip_address
    }
    
    # Save to MongoDB
    await db.activity_log.insert_one(log_entry)
    
    # Append to Google Sheets
    await append_single_row("Activity_Log", log_entry)

async def sync_all_data_to_sheets():
    """Full sync of all collections to Google Sheets"""
    logger.info("Starting full sync to Google Sheets...")
    
    # Sync Members
    members = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(10000)
    await sync_to_sheets("Members", members)
    
    # Sync Deposits
    deposits = await db.deposits.find({}, {"_id": 0}).to_list(10000)
    await sync_to_sheets("Deposits", deposits)
    
    # Sync Loans
    loans = await db.loans.find({}, {"_id": 0}).to_list(10000)
    await sync_to_sheets("Loans", loans)
    
    # Sync Withdrawals
    withdrawals = await db.withdrawals.find({}, {"_id": 0}).to_list(10000)
    await sync_to_sheets("Withdrawals", withdrawals)
    
    # Sync Activity Log
    activity = await db.activity_log.find({}, {"_id": 0}).to_list(10000)
    await sync_to_sheets("Activity_Log", activity)
    
    # Sync Group Stats snapshot
    stats = await compute_group_stats()
    stats["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    await append_single_row("Group_Stats", stats)
    
    logger.info("Full sync completed")

async def compute_group_stats() -> dict:
    """Compute current group statistics"""
    total_members = await db.users.count_documents({})
    premium_members = await db.users.count_documents({"membership_type": "premium"})
    ordinary_members = await db.users.count_documents({"membership_type": "ordinary"})
    
    # Total savings
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$total_savings"}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_savings = result[0]["total"] if result else 0
    
    # Total deposits
    pipeline = [{"$match": {"status": "approved"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    result = await db.deposits.aggregate(pipeline).to_list(1)
    total_deposits = result[0]["total"] if result else 0
    
    # Total withdrawals
    pipeline = [{"$match": {"status": "approved"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    result = await db.withdrawals.aggregate(pipeline).to_list(1)
    total_withdrawals = result[0]["total"] if result else 0
    
    # Active loans
    pipeline = [{"$match": {"status": "approved", "repaid": False}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    result = await db.loans.aggregate(pipeline).to_list(1)
    active_loans = result[0]["total"] if result else 0
    
    return {
        "total_members": total_members,
        "premium_members": premium_members,
        "ordinary_members": ordinary_members,
        "total_savings": total_savings,
        "total_deposits": total_deposits,
        "total_withdrawals": total_withdrawals,
        "active_loans": active_loans
    }

def register_new_sheet(sheet_name: str, collection: str = None, column_order: list = None, exclude_fields: list = None):
    """
    Register a new sheet type dynamically
    Call this when adding new data types/pages to the app
    """
    SHEET_REGISTRY[sheet_name] = {
        "collection": collection,
        "exclude_fields": exclude_fields or ["_id"],
        "column_order": column_order or []
    }
    logger.info(f"Registered new sheet type: {sheet_name}")

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    email = user_data.email.lower()
    
    # Check if user exists
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_doc = {
        "email": email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "phone": user_data.phone,
        "role": "member",
        "membership_type": "ordinary",
        "total_savings": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create tokens
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    # Sync to sheets
    all_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for u in all_users:
        if "created_at" in u and hasattr(u["created_at"], "isoformat"):
            u["created_at"] = u["created_at"].isoformat()
    await sync_to_sheets("Members", all_users)
    
    return {
        "id": user_id,
        "email": email,
        "name": user_data.name,
        "role": "member",
        "membership_type": "ordinary",
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    email = credentials.email.lower()
    
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    return {
        "id": user_id,
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "membership_type": user.get("membership_type", "ordinary"),
        "total_savings": user.get("total_savings", 0),
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/logout")
async def logout():
    return {"message": "Logged out successfully"}

# ==================== MEMBER ENDPOINTS ====================

@api_router.get("/members")
async def get_members(user: dict = Depends(get_current_user)):
    """Get all members"""
    members = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    result = []
    for m in members:
        m["id"] = str(m["_id"])
        m.pop("_id", None)
        result.append(m)
    return result

@api_router.get("/members/{member_id}")
async def get_member(member_id: str, user: dict = Depends(get_current_user)):
    """Get a specific member"""
    member = await db.users.find_one({"_id": ObjectId(member_id)}, {"password_hash": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member["id"] = str(member["_id"])
    member.pop("_id", None)
    return member

@api_router.delete("/members/{member_id}")
async def delete_member(member_id: str, user: dict = Depends(require_super_admin)):
    """Delete a member (Super Admin only)"""
    # Cannot delete self
    if member_id == user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    member = await db.users.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Cannot delete super admin
    if member.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot delete Super Admin")
    
    await db.users.delete_one({"_id": ObjectId(member_id)})
    
    # Sync to sheets
    all_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    await sync_to_sheets("Members", all_users)
    
    return {"message": "Member deleted successfully"}

# ==================== ADMIN MANAGEMENT (Super Admin only) ====================

@api_router.post("/admin/set-role")
async def set_user_role(data: RoleUpdate, user: dict = Depends(require_super_admin)):
    """Change user role (Super Admin only)"""
    if data.new_role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'admin' or 'member'")
    
    target_user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot change Super Admin role")
    
    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": {"role": data.new_role}}
    )
    
    return {"message": f"User role updated to {data.new_role}"}

@api_router.post("/admin/set-membership")
async def set_membership_type(data: MembershipUpdate, user: dict = Depends(require_admin)):
    """Change membership type (Admin/Super Admin only)"""
    if data.membership_type not in ["premium", "ordinary"]:
        raise HTTPException(status_code=400, detail="Invalid membership type. Must be 'premium' or 'ordinary'")
    
    target_user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": {"membership_type": data.membership_type}}
    )
    
    # Sync to sheets
    all_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    await sync_to_sheets("Members", all_users)
    
    return {"message": f"Membership updated to {data.membership_type}"}

# ==================== DEPOSIT ENDPOINTS ====================

@api_router.post("/deposits/request")
async def request_deposit(deposit: DepositRequest, user: dict = Depends(get_current_user)):
    """Request a deposit"""
    if deposit.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    deposit_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "amount": deposit.amount,
        "description": deposit.description,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "approved_by": None,
        "notes": None
    }
    
    result = await db.deposits.insert_one(deposit_doc)
    deposit_doc["id"] = str(result.inserted_id)
    deposit_doc.pop("_id", None)
    
    return deposit_doc

@api_router.get("/deposits")
async def get_deposits(user: dict = Depends(get_current_user)):
    """Get deposits based on user role"""
    if user.get("role") in ["admin", "super_admin"]:
        # Admins see all deposits
        deposits = await db.deposits.find({}).to_list(1000)
    else:
        # Members see only their deposits
        deposits = await db.deposits.find({"user_id": user["id"]}).to_list(1000)
    
    result = []
    for d in deposits:
        d["id"] = str(d["_id"])
        d.pop("_id", None)
        result.append(d)
    return result

@api_router.get("/deposits/pending")
async def get_pending_deposits(user: dict = Depends(require_admin)):
    """Get pending deposits (Admin only)"""
    deposits = await db.deposits.find({"status": "pending"}).to_list(1000)
    result = []
    for d in deposits:
        d["id"] = str(d["_id"])
        d.pop("_id", None)
        result.append(d)
    return result

@api_router.post("/deposits/approve")
async def approve_deposit(approval: TransactionApproval, user: dict = Depends(require_admin)):
    """Approve or reject a deposit (Admin only)"""
    deposit = await db.deposits.find_one({"_id": ObjectId(approval.transaction_id)})
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail="Deposit already processed")
    
    new_status = "approved" if approval.approved else "rejected"
    
    await db.deposits.update_one(
        {"_id": ObjectId(approval.transaction_id)},
        {"$set": {
            "status": new_status,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": user["id"],
            "notes": approval.notes
        }}
    )
    
    # If approved, update user's total savings
    if approval.approved:
        await db.users.update_one(
            {"_id": ObjectId(deposit["user_id"])},
            {"$inc": {"total_savings": deposit["amount"]}}
        )
        
        # Sync users to sheets
        all_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
        await sync_to_sheets("Members", all_users)
    
    # Sync deposits to sheets
    all_deposits = await db.deposits.find({}, {"_id": 0}).to_list(1000)
    await sync_to_sheets("Deposits", all_deposits)
    
    return {"message": f"Deposit {new_status}"}

# ==================== LOAN ENDPOINTS ====================

MAX_LOAN_AMOUNT = 600000  # UGX

@api_router.post("/loans/request")
async def request_loan(loan: LoanRequest, user: dict = Depends(get_current_user)):
    """Request a loan (Premium members only)"""
    if user.get("membership_type") != "premium":
        raise HTTPException(status_code=403, detail="Only premium members can request loans")
    
    if loan.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    if loan.amount > MAX_LOAN_AMOUNT:
        raise HTTPException(status_code=400, detail=f"Maximum loan amount is UGX {MAX_LOAN_AMOUNT:,}")
    
    # Check for existing active loans
    existing_loan = await db.loans.find_one({
        "user_id": user["id"],
        "status": {"$in": ["pending", "approved"]}
    })
    if existing_loan:
        raise HTTPException(status_code=400, detail="You already have an active loan")
    
    loan_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "amount": loan.amount,
        "reason": loan.reason,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "approved_by": None,
        "notes": None,
        "repaid": False
    }
    
    result = await db.loans.insert_one(loan_doc)
    loan_doc["id"] = str(result.inserted_id)
    loan_doc.pop("_id", None)
    
    return loan_doc

@api_router.get("/loans")
async def get_loans(user: dict = Depends(get_current_user)):
    """Get loans based on user role"""
    if user.get("role") in ["admin", "super_admin"]:
        loans = await db.loans.find({}).to_list(1000)
    else:
        loans = await db.loans.find({"user_id": user["id"]}).to_list(1000)
    
    result = []
    for l in loans:
        l["id"] = str(l["_id"])
        l.pop("_id", None)
        result.append(l)
    return result

@api_router.get("/loans/pending")
async def get_pending_loans(user: dict = Depends(require_admin)):
    """Get pending loans (Admin only)"""
    loans = await db.loans.find({"status": "pending"}).to_list(1000)
    result = []
    for l in loans:
        l["id"] = str(l["_id"])
        l.pop("_id", None)
        result.append(l)
    return result

@api_router.post("/loans/approve")
async def approve_loan(approval: TransactionApproval, user: dict = Depends(require_admin)):
    """Approve or reject a loan (Admin only)"""
    loan = await db.loans.find_one({"_id": ObjectId(approval.transaction_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan["status"] != "pending":
        raise HTTPException(status_code=400, detail="Loan already processed")
    
    new_status = "approved" if approval.approved else "rejected"
    
    await db.loans.update_one(
        {"_id": ObjectId(approval.transaction_id)},
        {"$set": {
            "status": new_status,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": user["id"],
            "notes": approval.notes
        }}
    )
    
    # Sync loans to sheets
    all_loans = await db.loans.find({}, {"_id": 0}).to_list(1000)
    await sync_to_sheets("Loans", all_loans)
    
    return {"message": f"Loan {new_status}"}

@api_router.post("/loans/{loan_id}/repay")
async def mark_loan_repaid(loan_id: str, user: dict = Depends(require_admin)):
    """Mark a loan as repaid (Admin only)"""
    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan["status"] != "approved":
        raise HTTPException(status_code=400, detail="Only approved loans can be marked as repaid")
    
    await db.loans.update_one(
        {"_id": ObjectId(loan_id)},
        {"$set": {"repaid": True, "status": "repaid"}}
    )
    
    # Sync loans to sheets
    all_loans = await db.loans.find({}, {"_id": 0}).to_list(1000)
    await sync_to_sheets("Loans", all_loans)
    
    return {"message": "Loan marked as repaid"}

# ==================== WITHDRAWAL ENDPOINTS ====================

@api_router.post("/withdrawals/request")
async def request_withdrawal(withdrawal: WithdrawalRequest, user: dict = Depends(get_current_user)):
    """Request a withdrawal"""
    if withdrawal.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    # Check user has enough savings
    user_data = await db.users.find_one({"_id": ObjectId(user["id"])})
    if user_data.get("total_savings", 0) < withdrawal.amount:
        raise HTTPException(status_code=400, detail="Insufficient savings")
    
    withdrawal_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "amount": withdrawal.amount,
        "reason": withdrawal.reason,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "approved_by": None,
        "notes": None
    }
    
    result = await db.withdrawals.insert_one(withdrawal_doc)
    withdrawal_doc["id"] = str(result.inserted_id)
    withdrawal_doc.pop("_id", None)
    
    return withdrawal_doc

@api_router.get("/withdrawals")
async def get_withdrawals(user: dict = Depends(get_current_user)):
    """Get withdrawals based on user role"""
    if user.get("role") in ["admin", "super_admin"]:
        withdrawals = await db.withdrawals.find({}).to_list(1000)
    else:
        withdrawals = await db.withdrawals.find({"user_id": user["id"]}).to_list(1000)
    
    result = []
    for w in withdrawals:
        w["id"] = str(w["_id"])
        w.pop("_id", None)
        result.append(w)
    return result

@api_router.get("/withdrawals/pending")
async def get_pending_withdrawals(user: dict = Depends(require_admin)):
    """Get pending withdrawals (Admin only)"""
    withdrawals = await db.withdrawals.find({"status": "pending"}).to_list(1000)
    result = []
    for w in withdrawals:
        w["id"] = str(w["_id"])
        w.pop("_id", None)
        result.append(w)
    return result

@api_router.post("/withdrawals/approve")
async def approve_withdrawal(approval: TransactionApproval, user: dict = Depends(require_admin)):
    """Approve or reject a withdrawal (Admin only)"""
    withdrawal = await db.withdrawals.find_one({"_id": ObjectId(approval.transaction_id)})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    if withdrawal["status"] != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal already processed")
    
    new_status = "approved" if approval.approved else "rejected"
    
    # If approving, check user still has enough savings
    if approval.approved:
        user_data = await db.users.find_one({"_id": ObjectId(withdrawal["user_id"])})
        if user_data.get("total_savings", 0) < withdrawal["amount"]:
            raise HTTPException(status_code=400, detail="User has insufficient savings")
    
    await db.withdrawals.update_one(
        {"_id": ObjectId(approval.transaction_id)},
        {"$set": {
            "status": new_status,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": user["id"],
            "notes": approval.notes
        }}
    )
    
    # If approved, update user's total savings
    if approval.approved:
        await db.users.update_one(
            {"_id": ObjectId(withdrawal["user_id"])},
            {"$inc": {"total_savings": -withdrawal["amount"]}}
        )
        
        # Sync users to sheets
        all_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
        await sync_to_sheets("Members", all_users)
    
    # Sync withdrawals to sheets
    all_withdrawals = await db.withdrawals.find({}, {"_id": 0}).to_list(1000)
    await sync_to_sheets("Withdrawals", all_withdrawals)
    
    return {"message": f"Withdrawal {new_status}"}

# ==================== GROUP STATS ====================

@api_router.get("/stats/group")
async def get_group_stats(user: dict = Depends(get_current_user)):
    """Get group statistics"""
    # Total members
    total_members = await db.users.count_documents({})
    premium_members = await db.users.count_documents({"membership_type": "premium"})
    ordinary_members = await db.users.count_documents({"membership_type": "ordinary"})
    
    # Total savings (sum of all users' total_savings)
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$total_savings"}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_savings = result[0]["total"] if result else 0
    
    # Total approved deposits
    pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = await db.deposits.aggregate(pipeline).to_list(1)
    total_deposits = result[0]["total"] if result else 0
    
    # Total approved withdrawals
    pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = await db.withdrawals.aggregate(pipeline).to_list(1)
    total_withdrawals = result[0]["total"] if result else 0
    
    # Active loans
    pipeline = [
        {"$match": {"status": "approved", "repaid": False}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    active_loans_amount = result[0]["total"] if result else 0
    active_loans_count = result[0]["count"] if result else 0
    
    # Pending requests
    pending_deposits = await db.deposits.count_documents({"status": "pending"})
    pending_loans = await db.loans.count_documents({"status": "pending"})
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    
    return {
        "total_members": total_members,
        "premium_members": premium_members,
        "ordinary_members": ordinary_members,
        "total_group_balance": total_savings,
        "total_deposits": total_deposits,
        "total_withdrawals": total_withdrawals,
        "active_loans_amount": active_loans_amount,
        "active_loans_count": active_loans_count,
        "pending_deposits": pending_deposits,
        "pending_loans": pending_loans,
        "pending_withdrawals": pending_withdrawals
    }

# ==================== ADMIN SEED ====================

async def seed_super_admin():
    """Seed super admin user"""
    admin_email = os.environ.get("ADMIN_EMAIL", "superadmin@savingsgroup.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "SuperAdmin@123")
    
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Super Admin",
            "phone": None,
            "role": "super_admin",
            "membership_type": "premium",
            "total_savings": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Super Admin created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info("Super Admin password updated")
    
    # Ensure super admin has correct role
    await db.users.update_one(
        {"email": admin_email},
        {"$set": {"role": "super_admin", "membership_type": "premium"}}
    )
    
    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write(f"# Test Credentials\n\n")
        f.write(f"## Super Admin\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write(f"- Role: super_admin\n\n")
        f.write(f"## Auth Endpoints\n")
        f.write(f"- POST /api/auth/register\n")
        f.write(f"- POST /api/auth/login\n")
        f.write(f"- GET /api/auth/me\n")
        f.write(f"- POST /api/auth/logout\n")

# ==================== SHEETS MANAGEMENT ENDPOINTS ====================

@api_router.post("/admin/sync-sheets")
async def trigger_full_sync(user: dict = Depends(require_admin)):
    """Trigger a full sync of all data to Google Sheets (Admin only)"""
    try:
        await sync_all_data_to_sheets()
        await log_activity(user["email"], "full_sheets_sync", "Triggered full sync to Google Sheets")
        return {"message": "Full sync completed successfully", "status": "success"}
    except Exception as e:
        logger.error(f"Full sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@api_router.get("/admin/sheets-status")
async def get_sheets_status(user: dict = Depends(require_admin)):
    """Check Google Sheets connection status and list worksheets"""
    service_account_email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
    
    try:
        gc = get_sheets_client()
        if not gc:
            return {
                "status": "disconnected", 
                "message": "Failed to connect to Google Sheets",
                "service_account_email": service_account_email
            }
        
        try:
            spreadsheet = gc.open_by_key(SPREADSHEET_ID)
            worksheets = [ws.title for ws in spreadsheet.worksheets()]
            
            return {
                "status": "connected",
                "spreadsheet_id": SPREADSHEET_ID,
                "spreadsheet_title": spreadsheet.title,
                "worksheets": worksheets,
                "registered_sheets": list(SHEET_REGISTRY.keys()),
                "service_account_email": service_account_email
            }
        except PermissionError:
            return {
                "status": "permission_denied",
                "message": "Please share your Google Spreadsheet with this email as Editor",
                "service_account_email": service_account_email,
                "spreadsheet_id": SPREADSHEET_ID,
                "instructions": [
                    "1. Open your Google Spreadsheet",
                    "2. Click 'Share' button",
                    f"3. Add this email: {service_account_email}",
                    "4. Set permission to 'Editor'",
                    "5. Click 'Send' (or 'Share')"
                ]
            }
        except gspread.exceptions.APIError as e:
            if "403" in str(e) or "permission" in str(e).lower():
                return {
                    "status": "permission_denied",
                    "message": "Please share your Google Spreadsheet with this email as Editor",
                    "service_account_email": service_account_email,
                    "spreadsheet_id": SPREADSHEET_ID,
                    "instructions": [
                        "1. Open your Google Spreadsheet",
                        "2. Click 'Share' button",
                        f"3. Add this email: {service_account_email}",
                        "4. Set permission to 'Editor'",
                        "5. Click 'Send' (or 'Share')"
                    ]
                }
            raise
    except Exception as e:
        error_msg = str(e)
        if not error_msg:
            error_msg = "Permission denied - please share the spreadsheet with the service account"
        return {
            "status": "permission_denied" if "permission" in str(type(e).__name__).lower() else "error", 
            "message": error_msg,
            "service_account_email": service_account_email,
            "spreadsheet_id": SPREADSHEET_ID,
            "instructions": [
                "1. Open your Google Spreadsheet",
                "2. Click 'Share' button",
                f"3. Add this email: {service_account_email}",
                "4. Set permission to 'Editor'",
                "5. Click 'Send' (or 'Share')"
            ]
        }

@api_router.post("/admin/create-sheet")
async def create_new_sheet(
    sheet_name: str,
    collection_name: str = None,
    user: dict = Depends(require_super_admin)
):
    """Create a new sheet and register it (Super Admin only)"""
    try:
        gc = get_sheets_client()
        if not gc:
            raise HTTPException(status_code=500, detail="Google Sheets not connected")
        
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
        
        # Check if sheet already exists
        existing_sheets = [ws.title for ws in spreadsheet.worksheets()]
        if sheet_name in existing_sheets:
            raise HTTPException(status_code=400, detail=f"Sheet '{sheet_name}' already exists")
        
        # Create the worksheet
        worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=30)
        
        # Register in the system
        register_new_sheet(sheet_name, collection=collection_name)
        
        await log_activity(user["email"], "create_sheet", f"Created new sheet: {sheet_name}")
        
        return {
            "message": f"Sheet '{sheet_name}' created successfully",
            "sheet_name": sheet_name,
            "collection": collection_name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/admin/sync-collection")
async def sync_specific_collection(
    sheet_name: str,
    user: dict = Depends(require_admin)
):
    """Sync a specific collection to its sheet"""
    try:
        config = SHEET_REGISTRY.get(sheet_name)
        if not config:
            raise HTTPException(status_code=404, detail=f"Sheet '{sheet_name}' not registered")
        
        collection_name = config.get("collection")
        if collection_name:
            collection = db[collection_name]
            exclude = config.get("exclude_fields", [])
            projection = {field: 0 for field in exclude if field != "_id"}
            projection["_id"] = 0
            
            data = await collection.find({}, projection).to_list(10000)
            await sync_to_sheets(sheet_name, data)
            
            return {"message": f"Synced {len(data)} rows to {sheet_name}"}
        else:
            return {"message": f"Sheet '{sheet_name}' has no associated collection"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CUSTOM DATA ENDPOINTS ====================

class CustomDataEntry(BaseModel):
    sheet_name: str
    data: dict

@api_router.post("/data/add-entry")
async def add_custom_entry(entry: CustomDataEntry, user: dict = Depends(require_admin)):
    """Add a custom data entry to any sheet (auto-creates columns)"""
    try:
        # Add metadata
        entry.data["added_by"] = user["email"]
        entry.data["added_at"] = datetime.now(timezone.utc).isoformat()
        
        # Save to MongoDB if collection exists
        config = SHEET_REGISTRY.get(entry.sheet_name, {})
        collection_name = config.get("collection")
        
        if collection_name:
            await db[collection_name].insert_one(entry.data.copy())
        
        # Append to sheets (will auto-add new columns)
        await append_single_row(entry.sheet_name, entry.data)
        
        await log_activity(user["email"], "add_entry", f"Added entry to {entry.sheet_name}")
        
        return {"message": "Entry added successfully", "sheet": entry.sheet_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== APP EVENTS ====================

@app.on_event("startup")
async def startup_event():
    try:
        # Test MongoDB connection
        await client.admin.command('ping')
        logger.info("MongoDB connected successfully")
        
        # Create indexes
        await db.users.create_index("email", unique=True)
        await db.deposits.create_index("user_id")
        await db.loans.create_index("user_id")
        await db.withdrawals.create_index("user_id")
        await db.activity_log.create_index("timestamp")
        
        # Seed super admin
        await seed_super_admin()
        
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        # Continue anyway - app will fail on first DB request
    
    # Initial sync to Google Sheets (in background to not block startup)
    try:
        logger.info("Starting initial Google Sheets sync...")
        await sync_all_data_to_sheets()
        logger.info("Initial Google Sheets sync completed")
    except Exception as e:
        logger.warning(f"Initial sheets sync failed (non-blocking): {e}")
    
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# CORS middleware - must be added BEFORE routes
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the API router FIRST
app.include_router(api_router)

@api_router.get("/")
async def root():
    return {"message": "Class One Savings API", "version": "1.0.0"}

# Serve static frontend files LAST (for production deployment)
static_dir = ROOT_DIR / "static"
if static_dir.exists():
    # Mount static assets
    static_assets = static_dir / "static"
    if static_assets.exists():
        app.mount("/static", StaticFiles(directory=str(static_assets)), name="static-assets")
    
    # Catch-all for frontend routes - MUST be last
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Don't serve frontend for API routes
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        
        # Try to serve the exact file first
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        
        # Otherwise serve index.html (for React Router)
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        
        raise HTTPException(status_code=404, detail="Not found")

