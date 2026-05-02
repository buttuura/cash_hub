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
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta

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

# Group Rules Constants
MONTHLY_SAVINGS = 52000  # UGX
DEVELOPMENT_FEE = 3000  # UGX per month
LATE_FEE_PER_POSITION = 3000  # UGX
MAX_LOAN_AMOUNT = 600000  # UGX
LOAN_INTEREST_NORMAL = 0.03  # 3% per month (within 4 months)
LOAN_INTEREST_EXTENDED = 0.05  # 5% per month (beyond 4 months)
LOAN_NORMAL_PERIOD_MONTHS = 4
MAX_GUARANTEES_PER_MEMBER = 2
COMMITTEE_APPRECIATION = 2000  # UGX per member
YEAR_END_DATE = "2026-12-20"

# Create the main app
app = FastAPI(title="Class One Savings API")
api_router = APIRouter(prefix="/api")

# ==================== PYDANTIC MODELS ====================

class UserCreate(BaseModel):
    phone: str
    password: str
    name: str
    email: Optional[EmailStr] = None

class UserLogin(BaseModel):
    identifier: str  # phone or email
    password: str

class DepositRequest(BaseModel):
    amount: float
    deposit_type: str = "savings"  # savings, development_fee
    description: Optional[str] = None

class LoanRequest(BaseModel):
    amount: float
    guarantor_id: str
    reason: Optional[str] = None

class GuarantorApproval(BaseModel):
    loan_id: str
    approved: bool
    notes: Optional[str] = None

class WithdrawalRequest(BaseModel):
    amount: float
    withdrawal_type: str = "savings"  # savings, leaving_group
    reason: Optional[str] = None

class RoleUpdate(BaseModel):
    user_id: str
    new_role: str

class MembershipUpdate(BaseModel):
    user_id: str
    membership_type: str

class TransactionApproval(BaseModel):
    transaction_id: str
    approved: bool
    notes: Optional[str] = None

class GroupBalanceUpdate(BaseModel):
    new_balance: float
    reason: str

class LeavingRequest(BaseModel):
    reason: Optional[str] = None

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

# ==================== HELPER FUNCTIONS ====================

def calculate_late_fee(day_of_month: int, position: int) -> float:
    """Calculate late fee based on payment date"""
    if day_of_month <= 10:
        return 0
    if day_of_month <= 20:
        return position * LATE_FEE_PER_POSITION
    return position * LATE_FEE_PER_POSITION  # Stops at 20th

def calculate_loan_interest(loan_amount: float, months_elapsed: int) -> float:
    """Calculate loan interest based on duration"""
    if months_elapsed <= LOAN_NORMAL_PERIOD_MONTHS:
        return loan_amount * LOAN_INTEREST_NORMAL * months_elapsed
    else:
        normal_interest = loan_amount * LOAN_INTEREST_NORMAL * LOAN_NORMAL_PERIOD_MONTHS
        extended_months = months_elapsed - LOAN_NORMAL_PERIOD_MONTHS
        extended_interest = loan_amount * LOAN_INTEREST_EXTENDED * extended_months
        return normal_interest + extended_interest

async def get_member_guarantee_count(member_id: str) -> int:
    """Count how many active loans this member is guaranteeing"""
    count = await db.loans.count_documents({
        "guarantor_id": member_id,
        "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
        "repaid": False
    })
    return count

async def check_can_leave_group(member_id: str) -> dict:
    """Check if member can leave the group"""
    # Check for active loans
    active_loan = await db.loans.find_one({
        "user_id": member_id,
        "status": "approved",
        "repaid": False
    })
    if active_loan:
        return {"can_leave": False, "reason": "You have an active loan"}
    
    # Check if guaranteeing anyone
    guaranteeing = await db.loans.find_one({
        "guarantor_id": member_id,
        "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
        "repaid": False
    })
    if guaranteeing:
        return {"can_leave": False, "reason": "You are a guarantor for an active loan"}
    
    # Check leaving request (must be 2 months notice)
    leaving_request = await db.leaving_requests.find_one({
        "user_id": member_id,
        "status": "approved"
    })
    if not leaving_request:
        return {"can_leave": False, "reason": "You must submit a leaving request and wait 2 months"}
    
    request_date = datetime.fromisoformat(leaving_request["created_at"].replace('Z', '+00:00'))
    two_months_later = request_date + timedelta(days=60)
    if datetime.now(timezone.utc) < two_months_later:
        days_remaining = (two_months_later - datetime.now(timezone.utc)).days
        return {"can_leave": False, "reason": f"You must wait {days_remaining} more days"}
    
    return {"can_leave": True, "reason": "You can leave the group"}

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    phone = user_data.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    
    email = user_data.email.lower() if user_data.email else None
    
    # Check phone uniqueness
    existing_phone = await db.users.find_one({"phone": phone})
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Check email uniqueness (if provided)
    if email:
        existing_email = await db.users.find_one({"email": email})
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "phone": phone,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": "member",
        "membership_type": "ordinary",
        "total_savings": 0,
        "development_fund": 0,
        "total_late_fees": 0,
        "guarantees_given": 0,
        "leaving_requested": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    if email:
        user_doc["email"] = email
    
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email or phone)
    refresh_token = create_refresh_token(user_id)
    
    return {
        "id": user_id,
        "email": email,
        "phone": phone,
        "name": user_data.name,
        "role": "member",
        "membership_type": "ordinary",
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    identifier = credentials.identifier.strip()
    
    # Try phone first, then email
    user = await db.users.find_one({"phone": identifier})
    if not user:
        user = await db.users.find_one({"email": identifier.lower()})
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid phone/email or password")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid phone/email or password")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, user.get("email") or user.get("phone"))
    refresh_token = create_refresh_token(user_id)
    
    return {
        "id": user_id,
        "email": user.get("email"),
        "phone": user.get("phone"),
        "name": user["name"],
        "role": user["role"],
        "membership_type": user.get("membership_type", "ordinary"),
        "total_savings": user.get("total_savings", 0),
        "development_fund": user.get("development_fund", 0),
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
    members = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    result = []
    is_super_admin = user.get("role") == "super_admin"
    
    for m in members:
        m["id"] = str(m["_id"])
        m.pop("_id", None)
        # Hide admin/super_admin role from non-super-admins
        if not is_super_admin and m.get("role") in ["admin", "super_admin"]:
            m["role"] = "member"
        result.append(m)
    return result

@api_router.get("/members/{member_id}")
async def get_member(member_id: str, user: dict = Depends(get_current_user)):
    member = await db.users.find_one({"_id": ObjectId(member_id)}, {"password_hash": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member["id"] = str(member["_id"])
    member.pop("_id", None)
    
    # Hide admin role from non-super-admins
    if user.get("role") != "super_admin" and member.get("role") in ["admin", "super_admin"]:
        member["role"] = "member"
    return member

@api_router.delete("/members/{member_id}")
async def delete_member(member_id: str, user: dict = Depends(require_super_admin)):
    if member_id == user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    member = await db.users.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if member.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot delete Super Admin")
    
    await db.users.delete_one({"_id": ObjectId(member_id)})
    return {"message": "Member deleted successfully"}

# ==================== ADMIN MANAGEMENT ====================

@api_router.post("/admin/set-role")
async def set_user_role(data: RoleUpdate, user: dict = Depends(require_super_admin)):
    if data.new_role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
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
    if data.membership_type not in ["premium", "ordinary"]:
        raise HTTPException(status_code=400, detail="Invalid membership type")
    
    target_user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": {"membership_type": data.membership_type}}
    )
    return {"message": f"Membership updated to {data.membership_type}"}

@api_router.post("/admin/update-group-balance")
async def update_group_balance(data: GroupBalanceUpdate, user: dict = Depends(require_super_admin)):
    """Super Admin can reset/edit total group balance (for year end)"""
    await db.settings.update_one(
        {"key": "group_balance"},
        {"$set": {"value": data.new_balance, "updated_at": datetime.now(timezone.utc).isoformat(), "reason": data.reason}},
        upsert=True
    )
    return {"message": f"Group balance updated to {data.new_balance}"}

# ==================== DEPOSIT ENDPOINTS ====================

@api_router.post("/deposits/request")
async def request_deposit(deposit: DepositRequest, user: dict = Depends(get_current_user)):
    if deposit.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    # Calculate late fee if applicable
    today = datetime.now(timezone.utc)
    day_of_month = today.day
    late_fee = 0
    
    if deposit.deposit_type == "savings":
        if deposit.amount < MONTHLY_SAVINGS:
            raise HTTPException(status_code=400, detail=f"Minimum monthly savings is UGX {MONTHLY_SAVINGS:,}")
        
        # Get position for late fee calculation
        if day_of_month > 10:
            # Count how many have paid this month before this user
            month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            paid_count = await db.deposits.count_documents({
                "deposit_type": "savings",
                "status": "approved",
                "created_at": {"$gte": month_start.isoformat()}
            })
            late_fee = calculate_late_fee(day_of_month, paid_count + 1)
    
    elif deposit.deposit_type == "development_fee":
        if deposit.amount < DEVELOPMENT_FEE:
            raise HTTPException(status_code=400, detail=f"Development fee is UGX {DEVELOPMENT_FEE:,}")
    
    deposit_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user.get("email"),
        "amount": deposit.amount,
        "deposit_type": deposit.deposit_type,
        "late_fee": late_fee,
        "description": deposit.description,
        "status": "pending",
        "month": today.strftime("%Y-%m"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "approved_by": None
    }
    
    result = await db.deposits.insert_one(deposit_doc)
    deposit_doc["id"] = str(result.inserted_id)
    deposit_doc.pop("_id", None)
    
    return deposit_doc

@api_router.get("/deposits")
async def get_deposits(user: dict = Depends(get_current_user)):
    if user.get("role") in ["admin", "super_admin"]:
        deposits = await db.deposits.find({}).to_list(1000)
    else:
        deposits = await db.deposits.find({"user_id": user["id"]}).to_list(1000)
    
    result = []
    for d in deposits:
        d["id"] = str(d["_id"])
        d.pop("_id", None)
        result.append(d)
    return result

@api_router.post("/deposits/approve")
async def approve_deposit(approval: TransactionApproval, user: dict = Depends(require_admin)):
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
    
    if approval.approved:
        if deposit.get("deposit_type") == "development_fee":
            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$inc": {"development_fund": deposit["amount"]}}
            )
        elif deposit.get("deposit_type") == "loan_payment":
            # Handle loan principal payment - need to find user's active loans
            user_loans = await db.loans.find({
                "user_id": deposit["user_id"],
                "status": "approved",
                "repaid": False
            }).to_list(100)
            
            remaining_payment = deposit["amount"]
            for loan in user_loans:
                if remaining_payment <= 0:
                    break
                
                outstanding_principal = loan["amount"] - (loan.get("amount_repaid", 0) - loan.get("interest_repaid", 0))
                if outstanding_principal > 0:
                    payment_to_apply = min(remaining_payment, outstanding_principal)
                    await db.loans.update_one(
                        {"_id": ObjectId(loan["_id"])},
                        {"$inc": {"amount_repaid": payment_to_apply}}
                    )
                    remaining_payment -= payment_to_apply
            
            # If payment exceeds loan amounts, add excess to savings
            if remaining_payment > 0:
                await db.users.update_one(
                    {"_id": ObjectId(deposit["user_id"])},
                    {"$inc": {"total_savings": remaining_payment}}
                )
        
        elif deposit.get("deposit_type") == "interest_payment":
            # Handle interest payment - need to find user's active loans
            user_loans = await db.loans.find({
                "user_id": deposit["user_id"],
                "status": "approved",
                "repaid": False
            }).to_list(100)
            
            remaining_payment = deposit["amount"]
            for loan in user_loans:
                if remaining_payment <= 0:
                    break
                
                outstanding_interest = loan.get("total_due", 0) - loan["amount"] - (loan.get("interest_repaid", 0))
                if outstanding_interest > 0:
                    payment_to_apply = min(remaining_payment, outstanding_interest)
                    await db.loans.update_one(
                        {"_id": ObjectId(loan["_id"])},
                        {"$inc": {"interest_repaid": payment_to_apply}}
                    )
                    remaining_payment -= payment_to_apply
            
            # If payment exceeds interest amounts, add excess to savings
            if remaining_payment > 0:
                await db.users.update_one(
                    {"_id": ObjectId(deposit["user_id"])},
                    {"$inc": {"total_savings": remaining_payment}}
                )
        
        else:  # savings
            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$inc": {
                    "total_savings": deposit["amount"],
                    "total_late_fees": deposit.get("late_fee", 0)
                }}
            )
        
        # Update user to premium if savings >= 52000
        member = await db.users.find_one({"_id": ObjectId(deposit["user_id"])})
        if member and member.get("total_savings", 0) >= MONTHLY_SAVINGS:
            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$set": {"membership_type": "premium"}}
            )
    
    return {"message": f"Deposit {new_status}"}

@api_router.delete("/deposits/{deposit_id}")
async def delete_deposit(deposit_id: str, user: dict = Depends(get_current_user)):
    """Delete a deposit. Members can delete own pending/rejected; super_admin can delete any."""
    deposit = await db.deposits.find_one({"_id": ObjectId(deposit_id)})
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    is_super = user.get("role") == "super_admin"
    is_owner = deposit.get("user_id") == user["id"]
    
    if not is_super:
        if not is_owner:
            raise HTTPException(status_code=403, detail="You can only delete your own records")
        if deposit.get("status") == "approved":
            raise HTTPException(status_code=403, detail="Approved deposits can only be deleted by Super Admin")
    
    # If approved, reverse the balance changes
    if deposit.get("status") == "approved":
        if deposit.get("deposit_type") == "development_fee":
            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$inc": {"development_fund": -deposit["amount"]}}
            )
        else:
            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$inc": {
                    "total_savings": -deposit["amount"],
                    "total_late_fees": -deposit.get("late_fee", 0)
                }}
            )
    
    await db.deposits.delete_one({"_id": ObjectId(deposit_id)})
    return {"message": "Deposit deleted"}

# ==================== LOAN ENDPOINTS ====================

@api_router.post("/loans/request")
async def request_loan(loan: LoanRequest, user: dict = Depends(get_current_user)):
    if user.get("membership_type") != "premium":
        raise HTTPException(status_code=403, detail="Only premium members can request loans")
    
    if loan.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    if loan.amount > MAX_LOAN_AMOUNT:
        raise HTTPException(status_code=400, detail=f"Maximum loan is UGX {MAX_LOAN_AMOUNT:,}")
    
    # Check for existing active loan
    existing_loan = await db.loans.find_one({
        "user_id": user["id"],
        "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
        "repaid": False
    })
    if existing_loan:
        raise HTTPException(status_code=400, detail="You already have an active or pending loan")
    
    # Validate guarantor
    if loan.guarantor_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot be your own guarantor")
    
    guarantor = await db.users.find_one({"_id": ObjectId(loan.guarantor_id)})
    if not guarantor:
        raise HTTPException(status_code=404, detail="Guarantor not found")
    
    # Check guarantor hasn't exceeded limit
    guarantee_count = await get_member_guarantee_count(loan.guarantor_id)
    if guarantee_count >= MAX_GUARANTEES_PER_MEMBER:
        raise HTTPException(status_code=400, detail=f"This member already guarantees {MAX_GUARANTEES_PER_MEMBER} loans")
    
    # Auto-calculate interest and total due (first month 3%)
    interest_amount = loan.amount * LOAN_INTEREST_NORMAL
    total_due = loan.amount + interest_amount
    
    loan_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user.get("email"),
        "amount": loan.amount,
        "interest_rate": LOAN_INTEREST_NORMAL,
        "initial_interest": interest_amount,
        "initial_total_due": total_due,
        "guarantor_id": loan.guarantor_id,
        "guarantor_name": guarantor["name"],
        "reason": loan.reason,
        "status": "pending_guarantor",
        "guarantor_approved": False,
        "guarantor_approved_at": None,
        "repaid": False,
        "amount_repaid": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "due_date": None,
        "approved_by": None
    }
    
    result = await db.loans.insert_one(loan_doc)
    loan_doc["id"] = str(result.inserted_id)
    loan_doc.pop("_id", None)
    
    return loan_doc

@api_router.post("/loans/guarantor-approve")
async def guarantor_approve_loan(approval: GuarantorApproval, user: dict = Depends(get_current_user)):
    """Selected guarantor approves or rejects the loan request first, before admin"""
    loan = await db.loans.find_one({"_id": ObjectId(approval.loan_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.get("guarantor_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Only the selected guarantor can approve")
    
    if loan.get("status") != "pending_guarantor":
        raise HTTPException(status_code=400, detail="Loan is not awaiting guarantor approval")
    
    if approval.approved:
        new_status = "pending_admin"
        update = {
            "status": new_status,
            "guarantor_approved": True,
            "guarantor_approved_at": datetime.now(timezone.utc).isoformat(),
            "guarantor_notes": approval.notes
        }
    else:
        new_status = "rejected_by_guarantor"
        update = {
            "status": new_status,
            "guarantor_approved": False,
            "guarantor_approved_at": datetime.now(timezone.utc).isoformat(),
            "guarantor_notes": approval.notes
        }
    
    await db.loans.update_one(
        {"_id": ObjectId(approval.loan_id)},
        {"$set": update}
    )
    
    return {"message": f"Loan {new_status.replace('_', ' ')}"}

@api_router.get("/loans")
async def get_loans(user: dict = Depends(get_current_user)):
    if user.get("role") in ["admin", "super_admin"]:
        loans = await db.loans.find({}).to_list(1000)
    else:
        # Show loans where user is borrower or guarantor
        loans = await db.loans.find({
            "$or": [
                {"user_id": user["id"]},
                {"guarantor_id": user["id"]}
            ]
        }).to_list(1000)
    
    result = []
    for l in loans:
        l["id"] = str(l["_id"])
        l.pop("_id", None)
        
        # For pending loans, surface initial interest/total if not present (backward-compat)
        if l.get("status") in ["pending_guarantor", "pending_admin"]:
            if not l.get("initial_interest"):
                l["initial_interest"] = l["amount"] * LOAN_INTEREST_NORMAL
                l["initial_total_due"] = l["amount"] + l["initial_interest"]
            l["current_interest"] = l.get("initial_interest")
            l["total_due"] = l.get("initial_total_due")
        
        # Calculate current interest for approved loans
        if l.get("status") == "approved" and not l.get("repaid"):
            approved_date = datetime.fromisoformat(l["approved_at"].replace('Z', '+00:00'))
            months_elapsed = max(1, (datetime.now(timezone.utc) - approved_date).days // 30)
            l["current_interest"] = calculate_loan_interest(l["amount"], months_elapsed)
            l["total_due"] = l["amount"] + l["current_interest"]
            l["months_elapsed"] = months_elapsed
        
        result.append(l)
    return result

@api_router.post("/loans/approve")
async def approve_loan(approval: TransactionApproval, user: dict = Depends(require_admin)):
    loan = await db.loans.find_one({"_id": ObjectId(approval.transaction_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    # Admin can only act after guarantor approves
    if loan["status"] != "pending_admin":
        if loan["status"] == "pending_guarantor":
            raise HTTPException(status_code=400, detail="Loan must be approved by guarantor first")
        raise HTTPException(status_code=400, detail="Loan already processed")
    
    new_status = "approved" if approval.approved else "rejected"
    
    update_data = {
        "status": new_status,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": user["id"],
        "notes": approval.notes
    }
    
    if approval.approved:
        # Set due date (4 months from approval)
        due_date = datetime.now(timezone.utc) + timedelta(days=120)
        update_data["due_date"] = due_date.isoformat()
        
        # Increment guarantor's guarantee count
        await db.users.update_one(
            {"_id": ObjectId(loan["guarantor_id"])},
            {"$inc": {"guarantees_given": 1}}
        )
    
    await db.loans.update_one(
        {"_id": ObjectId(approval.transaction_id)},
        {"$set": update_data}
    )
    
    return {"message": f"Loan {new_status}"}

@api_router.post("/loans/{loan_id}/repay")
async def repay_loan(loan_id: str, amount: float, user: dict = Depends(require_admin)):
    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan["status"] != "approved":
        raise HTTPException(status_code=400, detail="Loan not approved")
    
    if loan.get("repaid"):
        raise HTTPException(status_code=400, detail="Loan already repaid")
    
    # Calculate total due
    approved_date = datetime.fromisoformat(loan["approved_at"].replace('Z', '+00:00'))
    months_elapsed = max(1, (datetime.now(timezone.utc) - approved_date).days // 30)
    interest = calculate_loan_interest(loan["amount"], months_elapsed)
    total_due = loan["amount"] + interest
    
    new_amount_repaid = loan.get("amount_repaid", 0) + amount
    fully_repaid = new_amount_repaid >= total_due
    
    await db.loans.update_one(
        {"_id": ObjectId(loan_id)},
        {"$set": {
            "amount_repaid": new_amount_repaid,
            "repaid": fully_repaid,
            "repaid_at": datetime.now(timezone.utc).isoformat() if fully_repaid else None,
            "status": "repaid" if fully_repaid else "approved"
        }}
    )
    
    # Decrement guarantor's guarantee count if fully repaid
    if fully_repaid:
        await db.users.update_one(
            {"_id": ObjectId(loan["guarantor_id"])},
            {"$inc": {"guarantees_given": -1}}
        )
    
    return {
        "message": "Payment recorded",
        "amount_paid": amount,
        "total_repaid": new_amount_repaid,
        "total_due": total_due,
        "fully_repaid": fully_repaid
    }

# ==================== WITHDRAWAL ENDPOINTS ====================

@api_router.delete("/loans/{loan_id}")
async def delete_loan(loan_id: str, user: dict = Depends(get_current_user)):
    """Delete a loan. Members can delete own pending/rejected; super_admin can delete any (including approved/repaid)."""
    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    is_super = user.get("role") == "super_admin"
    is_owner = loan.get("user_id") == user["id"]
    
    if not is_super:
        if not is_owner:
            raise HTTPException(status_code=403, detail="You can only delete your own records")
        if loan.get("status") in ["approved", "pending_admin"]:
            raise HTTPException(status_code=403, detail="Approved/admin-pending loans can only be deleted by Super Admin")
    
    # If loan was approved and guarantor counter was incremented, decrement back
    if loan.get("status") == "approved" and not loan.get("repaid") and loan.get("guarantor_id"):
        await db.users.update_one(
            {"_id": ObjectId(loan["guarantor_id"])},
            {"$inc": {"guarantees_given": -1}}
        )
    
    await db.loans.delete_one({"_id": ObjectId(loan_id)})
    return {"message": "Loan deleted"}

@api_router.post("/withdrawals/request")
async def request_withdrawal(withdrawal: WithdrawalRequest, user: dict = Depends(get_current_user)):
    if withdrawal.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    user_data = await db.users.find_one({"_id": ObjectId(user["id"])})
    
    if withdrawal.withdrawal_type == "leaving_group":
        # Check if can leave
        leave_check = await check_can_leave_group(user["id"])
        if not leave_check["can_leave"]:
            raise HTTPException(status_code=400, detail=leave_check["reason"])
        
        # Can withdraw savings + development fund
        max_amount = user_data.get("total_savings", 0) + user_data.get("development_fund", 0)
        if withdrawal.amount > max_amount:
            raise HTTPException(status_code=400, detail="Insufficient funds")
    else:
        # Regular withdrawal - only from savings, not development fund
        if withdrawal.amount > user_data.get("total_savings", 0):
            raise HTTPException(status_code=400, detail="Insufficient savings (development fund cannot be withdrawn)")
    
    withdrawal_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user.get("email"),
        "amount": withdrawal.amount,
        "withdrawal_type": withdrawal.withdrawal_type,
        "reason": withdrawal.reason,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "approved_by": None
    }
    
    result = await db.withdrawals.insert_one(withdrawal_doc)
    withdrawal_doc["id"] = str(result.inserted_id)
    withdrawal_doc.pop("_id", None)
    
    return withdrawal_doc

@api_router.get("/withdrawals")
async def get_withdrawals(user: dict = Depends(get_current_user)):
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

@api_router.post("/withdrawals/approve")
async def approve_withdrawal(approval: TransactionApproval, user: dict = Depends(require_admin)):
    withdrawal = await db.withdrawals.find_one({"_id": ObjectId(approval.transaction_id)})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    if withdrawal["status"] != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal already processed")
    
    new_status = "approved" if approval.approved else "rejected"
    
    if approval.approved:
        user_data = await db.users.find_one({"_id": ObjectId(withdrawal["user_id"])})
        
        if withdrawal.get("withdrawal_type") == "leaving_group":
            # Deduct from both savings and development fund
            total_available = user_data.get("total_savings", 0) + user_data.get("development_fund", 0)
            if total_available < withdrawal["amount"]:
                raise HTTPException(status_code=400, detail="Insufficient funds")
            
            await db.users.update_one(
                {"_id": ObjectId(withdrawal["user_id"])},
                {"$set": {"total_savings": 0, "development_fund": 0}}
            )
        else:
            if user_data.get("total_savings", 0) < withdrawal["amount"]:
                raise HTTPException(status_code=400, detail="Insufficient savings")
            
            await db.users.update_one(
                {"_id": ObjectId(withdrawal["user_id"])},
                {"$inc": {"total_savings": -withdrawal["amount"]}}
            )
    
    await db.withdrawals.update_one(
        {"_id": ObjectId(approval.transaction_id)},
        {"$set": {
            "status": new_status,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": user["id"],
            "notes": approval.notes
        }}
    )
    
    return {"message": f"Withdrawal {new_status}"}

# ==================== LEAVING GROUP ====================

@api_router.delete("/withdrawals/{withdrawal_id}")
async def delete_withdrawal(withdrawal_id: str, user: dict = Depends(get_current_user)):
    """Delete a withdrawal. Members can delete own pending/rejected; super_admin can delete any."""
    withdrawal = await db.withdrawals.find_one({"_id": ObjectId(withdrawal_id)})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    is_super = user.get("role") == "super_admin"
    is_owner = withdrawal.get("user_id") == user["id"]
    
    if not is_super:
        if not is_owner:
            raise HTTPException(status_code=403, detail="You can only delete your own records")
        if withdrawal.get("status") == "approved":
            raise HTTPException(status_code=403, detail="Approved withdrawals can only be deleted by Super Admin")
    
    # Reverse balance changes if it was approved
    if withdrawal.get("status") == "approved":
        if withdrawal.get("withdrawal_type") != "leaving_group":
            await db.users.update_one(
                {"_id": ObjectId(withdrawal["user_id"])},
                {"$inc": {"total_savings": withdrawal["amount"]}}
            )
    
    await db.withdrawals.delete_one({"_id": ObjectId(withdrawal_id)})
    return {"message": "Withdrawal deleted"}

@api_router.post("/leaving/request")
async def request_to_leave(data: LeavingRequest, user: dict = Depends(get_current_user)):
    """Request to leave the group (2 months notice required)"""
    
    # Check if already requested
    existing = await db.leaving_requests.find_one({
        "user_id": user["id"],
        "status": {"$in": ["pending", "approved"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="You already have a leaving request")
    
    # Check for active loans
    active_loan = await db.loans.find_one({
        "user_id": user["id"],
        "status": "approved",
        "repaid": False
    })
    if active_loan:
        raise HTTPException(status_code=400, detail="Clear your loan before requesting to leave")
    
    # Check if guaranteeing
    guaranteeing = await db.loans.find_one({
        "guarantor_id": user["id"],
        "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
        "repaid": False
    })
    if guaranteeing:
        raise HTTPException(status_code=400, detail="You are guaranteeing a loan. Wait for it to be repaid.")
    
    request_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "reason": data.reason,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "can_leave_after": (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
    }
    
    await db.leaving_requests.insert_one(request_doc)
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"leaving_requested": True}}
    )
    
    return {"message": "Leaving request submitted. You can leave after 2 months."}

@api_router.get("/leaving/status")
async def get_leaving_status(user: dict = Depends(get_current_user)):
    leave_check = await check_can_leave_group(user["id"])
    request = await db.leaving_requests.find_one({"user_id": user["id"], "status": {"$in": ["pending", "approved"]}})
    return {
        **leave_check,
        "request": request
    }

# ==================== GROUP STATS ====================

async def calculate_total_interest_earned() -> float:
    """Calculate total interest earned from all repaid and active loans"""
    total_interest = 0
    
    # Get all approved loans (both repaid and active)
    loans = await db.loans.find({"status": {"$in": ["approved", "repaid"]}}).to_list(1000)
    
    for loan in loans:
        if loan.get("repaid"):
            # For repaid loans, calculate based on repayment
            amount_repaid = loan.get("amount_repaid", 0)
            principal = loan.get("amount", 0)
            interest = max(0, amount_repaid - principal)
            total_interest += interest
        else:
            # For active loans, calculate current interest
            if loan.get("approved_at"):
                approved_date = datetime.fromisoformat(loan["approved_at"].replace('Z', '+00:00'))
                months_elapsed = max(1, (datetime.now(timezone.utc) - approved_date).days // 30)
                if months_elapsed <= LOAN_NORMAL_PERIOD_MONTHS:
                    interest = loan["amount"] * LOAN_INTEREST_NORMAL * months_elapsed
                else:
                    normal_interest = loan["amount"] * LOAN_INTEREST_NORMAL * LOAN_NORMAL_PERIOD_MONTHS
                    extended_months = months_elapsed - LOAN_NORMAL_PERIOD_MONTHS
                    extended_interest = loan["amount"] * LOAN_INTEREST_EXTENDED * extended_months
                    interest = normal_interest + extended_interest
                total_interest += interest
    
    return total_interest

async def calculate_total_late_fees() -> float:
    """Calculate total late fees collected"""
    pipeline = [
        {"$match": {"status": "approved", "late_fee": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$late_fee"}}}
    ]
    result = await db.deposits.aggregate(pipeline).to_list(1)
    return result[0]["total"] if result else 0

async def get_total_petty_cash_used() -> float:
    """Get total petty cash expenses"""
    pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = await db.petty_cash.aggregate(pipeline).to_list(1)
    return result[0]["total"] if result else 0

@api_router.get("/stats/group")
async def get_group_stats(user: dict = Depends(get_current_user)):
    total_members = await db.users.count_documents({})
    premium_members = await db.users.count_documents({"membership_type": "premium"})
    
    # Total savings from all members
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$total_savings"}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_savings = result[0]["total"] if result else 0
    
    # Total development fund from all members
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$development_fund"}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_development = result[0]["total"] if result else 0
    
    # Total interest earned
    total_interest = await calculate_total_interest_earned()
    
    # Total late fees
    total_late_fees = await calculate_total_late_fees()
    
    # Total petty cash used
    total_petty_cash = await get_total_petty_cash_used()
    
    # Active loans
    pipeline = [
        {"$match": {"status": "approved", "repaid": False}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    active_loans_amount = result[0]["total"] if result else 0
    active_loans_count = result[0]["count"] if result else 0
    
    # Total loans ever given
    pipeline = [
        {"$match": {"status": {"$in": ["approved", "repaid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    total_loans_given = result[0]["total"] if result else 0
    total_loans_count = result[0]["count"] if result else 0
    
    # AUTO-CALCULATE Total Group Balance
    # = Total Savings + Development Fund + Interest Earned + Late Fees - Petty Cash
    total_group_balance = total_savings + total_development + total_interest + total_late_fees - total_petty_cash
    
    # Pending counts
    pending_deposits = await db.deposits.count_documents({"status": "pending"})
    pending_loans = await db.loans.count_documents({"status": {"$in": ["pending_guarantor", "pending_admin"]}})
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    
    return {
        "total_members": total_members,
        "premium_members": premium_members,
        "ordinary_members": total_members - premium_members,
        "total_savings": total_savings,
        "total_development_fund": total_development,
        "total_interest_earned": total_interest,
        "total_late_fees": total_late_fees,
        "total_petty_cash_used": total_petty_cash,
        "total_group_balance": total_group_balance,
        "active_loans_amount": active_loans_amount,
        "active_loans_count": active_loans_count,
        "total_loans_given": total_loans_given,
        "total_loans_count": total_loans_count,
        "pending_deposits": pending_deposits,
        "pending_loans": pending_loans,
        "pending_withdrawals": pending_withdrawals,
        "monthly_savings_required": MONTHLY_SAVINGS,
        "development_fee": DEVELOPMENT_FEE,
        "max_loan_amount": MAX_LOAN_AMOUNT,
        "year_end_date": YEAR_END_DATE
    }

# ==================== FINANCIAL STATS ====================

@api_router.get("/stats/financial")
async def get_financial_stats(user: dict = Depends(get_current_user)):
    """Get detailed financial breakdown"""
    
    # Total savings
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$total_savings"}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_savings = result[0]["total"] if result else 0
    
    # Total development fund
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$development_fund"}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_development = result[0]["total"] if result else 0
    
    # Total interest earned
    total_interest = await calculate_total_interest_earned()
    
    # Total late fees
    total_late_fees = await calculate_total_late_fees()
    
    # Total petty cash
    total_petty_cash = await get_total_petty_cash_used()
    
    # Get petty cash breakdown
    petty_cash_items = await db.petty_cash.find({}).sort("created_at", -1).to_list(100)
    for item in petty_cash_items:
        item["id"] = str(item["_id"])
        item.pop("_id", None)
    
    # Active loans details
    pipeline = [
        {"$match": {"status": "approved", "repaid": False}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    active_loans_amount = result[0]["total"] if result else 0
    active_loans_count = result[0]["count"] if result else 0
    
    # Repaid loans
    pipeline = [
        {"$match": {"status": "repaid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    repaid_loans_amount = result[0]["total"] if result else 0
    repaid_loans_count = result[0]["count"] if result else 0
    
    # Total approved withdrawals
    pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = await db.withdrawals.aggregate(pipeline).to_list(1)
    total_withdrawals = result[0]["total"] if result else 0
    
    # Total group balance
    total_group_balance = total_savings + total_development + total_interest + total_late_fees - total_petty_cash
    
    return {
        "total_savings": total_savings,
        "total_development_fund": total_development,
        "total_interest_earned": total_interest,
        "total_late_fees": total_late_fees,
        "total_petty_cash_used": total_petty_cash,
        "total_group_balance": total_group_balance,
        "active_loans_amount": active_loans_amount,
        "active_loans_count": active_loans_count,
        "repaid_loans_amount": repaid_loans_amount,
        "repaid_loans_count": repaid_loans_count,
        "total_withdrawals": total_withdrawals,
        "petty_cash_items": petty_cash_items,
        "breakdown": {
            "savings": {"amount": total_savings, "label": "Member Savings"},
            "development": {"amount": total_development, "label": "Development Fund"},
            "interest": {"amount": total_interest, "label": "Loan Interest"},
            "late_fees": {"amount": total_late_fees, "label": "Late Fees"},
            "petty_cash": {"amount": -total_petty_cash, "label": "Petty Cash (Expenses)"}
        }
    }

# ==================== PETTY CASH ENDPOINTS ====================

class PettyCashEntry(BaseModel):
    amount: float
    description: str
    category: Optional[str] = "general"

@api_router.post("/petty-cash/add")
async def add_petty_cash(entry: PettyCashEntry, user: dict = Depends(require_admin)):
    """Add a petty cash expense (Admin only)"""
    if entry.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    petty_cash_doc = {
        "amount": entry.amount,
        "description": entry.description,
        "category": entry.category,
        "added_by": user["id"],
        "added_by_name": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.petty_cash.insert_one(petty_cash_doc)
    petty_cash_doc["id"] = str(result.inserted_id)
    petty_cash_doc.pop("_id", None)
    
    return petty_cash_doc

@api_router.get("/petty-cash")
async def get_petty_cash(user: dict = Depends(get_current_user)):
    """Get all petty cash entries"""
    items = await db.petty_cash.find({}).sort("created_at", -1).to_list(1000)
    result = []
    for item in items:
        item["id"] = str(item["_id"])
        item.pop("_id", None)
        result.append(item)
    return result

@api_router.delete("/petty-cash/{entry_id}")
async def delete_petty_cash(entry_id: str, user: dict = Depends(require_admin)):
    """Delete a petty cash entry (Admin or Super Admin)"""
    result = await db.petty_cash.delete_one({"_id": ObjectId(entry_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Petty cash entry deleted"}

@api_router.get("/stats/rules")
async def get_group_rules():
    """Return group rules for display"""
    return {
        "monthly_savings": MONTHLY_SAVINGS,
        "development_fee": DEVELOPMENT_FEE,
        "late_fee_per_position": LATE_FEE_PER_POSITION,
        "max_loan_amount": MAX_LOAN_AMOUNT,
        "loan_interest_normal": f"{LOAN_INTEREST_NORMAL * 100}%",
        "loan_interest_extended": f"{LOAN_INTEREST_EXTENDED * 100}%",
        "loan_normal_period_months": LOAN_NORMAL_PERIOD_MONTHS,
        "max_guarantees_per_member": MAX_GUARANTEES_PER_MEMBER,
        "committee_appreciation": COMMITTEE_APPRECIATION,
        "year_end_date": YEAR_END_DATE,
        "rules": [
            f"Monthly savings: UGX {MONTHLY_SAVINGS:,} (due 1st-10th)",
            f"Late fee: UGX {LATE_FEE_PER_POSITION:,} per position after 10th",
            f"Development fee: UGX {DEVELOPMENT_FEE:,} per month (non-withdrawable)",
            f"Max loan: UGX {MAX_LOAN_AMOUNT:,}",
            f"Loan interest: 3% per month (within 4 months), 5% beyond",
            f"Each loan requires a guarantor (max 2 guarantees per member)",
            f"2 months notice required to leave group",
            f"Year-end sharing: {YEAR_END_DATE}"
        ]
    }

# ==================== ADMIN SEED ====================

async def seed_super_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "superadmin@savingsgroup.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "SuperAdmin@123")
    admin_phone = os.environ.get("ADMIN_PHONE", "0700000000")
    
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Super Admin",
            "phone": admin_phone,
            "role": "super_admin",
            "membership_type": "premium",
            "total_savings": 0,
            "development_fund": 0,
            "total_late_fees": 0,
            "guarantees_given": 0,
            "leaving_requested": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Super Admin created: {admin_email} / {admin_phone}")
    else:
        update_fields = {"role": "super_admin", "membership_type": "premium"}
        if not existing.get("phone"):
            update_fields["phone"] = admin_phone
        await db.users.update_one(
            {"email": admin_email},
            {"$set": update_fields}
        )

# ==================== APP EVENTS ====================

@app.on_event("startup")
async def startup_event():
    try:
        await client.admin.command('ping')
        logger.info("MongoDB connected successfully")
        
        # Drop old non-sparse email index if present, then recreate as sparse
        try:
            await db.users.drop_index("email_1")
        except Exception:
            pass
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("phone", unique=True, sparse=True)
        await db.deposits.create_index("user_id")
        await db.loans.create_index("user_id")
        await db.loans.create_index("guarantor_id")
        await db.withdrawals.create_index("user_id")
        await db.leaving_requests.create_index("user_id")
        
        await seed_super_admin()
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
    
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the API router
app.include_router(api_router)

@api_router.get("/")
async def root():
    return {"message": "Class One Savings API", "version": "2.0.0"}

# Serve static frontend files
static_dir = ROOT_DIR / "static"
if static_dir.exists():
    static_assets = static_dir / "static"
    if static_assets.exists():
        app.mount("/static", StaticFiles(directory=str(static_assets)), name="static-assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        
        raise HTTPException(status_code=404, detail="Not found")
