from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
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
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

# Google Sheets Configuration
SPREADSHEET_ID = os.environ.get('GOOGLE_SPREADSHEET_ID')
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

# Create the main app
app = FastAPI(title="Group Cash Management API")

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

# ==================== GOOGLE SHEETS SYNC ====================

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

async def sync_to_sheets(sheet_name: str, data: list):
    """Sync data to Google Sheets"""
    try:
        gc = get_sheets_client()
        if not gc:
            logger.warning("Google Sheets client not available")
            return
        
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
        
        # Try to get the worksheet, or create it
        try:
            worksheet = spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=20)
        
        if data:
            # Clear and update
            worksheet.clear()
            headers = list(data[0].keys()) if data else []
            if headers:
                worksheet.update('A1', [headers] + [[str(row.get(h, '')) for h in headers] for row in data])
        
        logger.info(f"Synced {len(data)} rows to {sheet_name}")
    except Exception as e:
        logger.error(f"Failed to sync to sheets: {e}")

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

# ==================== APP EVENTS ====================

@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.deposits.create_index("user_id")
    await db.loans.create_index("user_id")
    await db.withdrawals.create_index("user_id")
    
    # Seed super admin
    await seed_super_admin()
    
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Include the router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@api_router.get("/")
async def root():
    return {"message": "Group Cash Management API", "version": "1.0.0"}
