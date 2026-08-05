from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Form, File, UploadFile, Body, WebSocket, WebSocketDisconnect, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import re
import logging
import shutil
import secrets
import string
from urllib.parse import quote
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import bcrypt
import jwt
from uuid import uuid4
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import anyio
import cloudinary
import cloudinary.uploader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']  # Removed .get() and fallback
if not mongo_url:
    raise ValueError("MONGO_URL not found in .env file")
    
logger.info(f"Connecting to MongoDB: {mongo_url[:25]}...")  # This will print part of the URL
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'default-secret-change-in-production')
JWT_ALGORITHM = "HS256"

# Cloudinary configuration
CLOUDINARY_URL = os.environ.get('CLOUDINARY_URL')
if CLOUDINARY_URL:
    cloudinary.config(cloudinary_url=CLOUDINARY_URL)
else:
    logger.warning("CLOUDINARY_URL not set, uploads to Cloudinary are disabled.")

# Group Rules Constants
MONTHLY_SAVINGS = 52000  # UGX
DEVELOPMENT_FEE = 3000  # UGX per slot per month
LATE_FEE_PER_POSITION = 3000  # UGX
MAX_LOAN_AMOUNT = 600000  # UGX
LOAN_INTEREST_NORMAL = 0.03  # 3% per month (within 4 months)
LOAN_INTEREST_EXTENDED = 0.05  # 5% per month (beyond 4 months)
LOAN_NORMAL_PERIOD_MONTHS = 4
QUICK_LOAN_INTEREST = 0.10  # 10% flat for quick loans
MAX_GUARANTEES_PER_MEMBER = 2
COMMITTEE_APPRECIATION = 2000  # UGX per member
YEAR_END_DATE = "2026-12-20"

# Loan Officers list (populated from DB or static config; empty by default)
OFFICERS: list[dict] = [
    {"name": "Ahimbisibwe Alexandar", "code": "AA001", "signature": "/signatures/ahimbisibwe.png"},
    {"name": "Nuabiine Nicholous", "code": "NN002", "signature": "/signatures/nuabiine.png"},
    {"name": "Owayesu Ronald", "code": "OR003", "signature": "/signatures/owayesu.png"},
    {"name": "Buttuura Isaiah", "code": "BI004", "signature": "/signatures/buttuura.png"},
]

# Create the main app
app = FastAPI(title="Class One Savings API")
# Add CORS middleware - FIX for "blocked by CORS policy"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://c1group.site",
        "https://cash-hub.onrender.com",
        "https://cash-hub-api.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api_router = APIRouter(prefix="/api")

# ==================== WEBSOCKET CONNECTION MANAGER ====================

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, seller_name: str):
        await websocket.accept()
        if seller_name not in self.active_connections:
            self.active_connections[seller_name] = []
        self.active_connections[seller_name].append(websocket)

    def disconnect(self, websocket: WebSocket, seller_name: str):
        if seller_name in self.active_connections:
            self.active_connections[seller_name].remove(websocket)
            if not self.active_connections[seller_name]:
                del self.active_connections[seller_name]

    async def broadcast_to_seller(self, seller_name: str, message: dict):
        import json
        if seller_name in self.active_connections:
            dead = []
            for ws in self.active_connections[seller_name]:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.disconnect(ws, seller_name)

manager = ConnectionManager()

# ==================== PYDANTIC MODELS ====================

class UserCreate(BaseModel):
    phone: str
    password: str
    name: str
    email: Optional[EmailStr] = None
    next_of_kin_name: Optional[str] = None
    national_id: Optional[str] = None

class UserLogin(BaseModel):
    identifier: str  # phone or email
    password: str

class DepositRequest(BaseModel):
    amount: float
    deposit_type: str = "savings"  # savings, development_fee
    description: Optional[str] = None
    target_user_id: Optional[str] = None
    deduct_late_fee: bool = False

class LoanRequest(BaseModel):
    amount: float
    guarantor_id: str
    reason: Optional[str] = None

class AdminLoanCreate(BaseModel):
    member_id: str
    amount: float
    reason: Optional[str] = None
    guarantor_id: Optional[str] = None

class GuarantorApproval(BaseModel):
    loan_id: str
    approved: bool
    notes: Optional[str] = None

class QuickLoanRequest(BaseModel):
    loan_name: str
    loan_email: Optional[EmailStr] = None
    loan_phone: Optional[str] = None
    amount: float
    purpose: Optional[str] = None
    collateral: Optional[str] = None
    is_guaranteed: bool = True
    officer_code: Optional[str] = None
    officer_name: Optional[str] = None
    collateral_image: Optional[str] = None
    member_code: Optional[str] = None

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

class MaxGuaranteesUpdate(BaseModel):
    user_id: str
    max_guarantees: int

class TransactionApproval(BaseModel):
    transaction_id: str
    approved: bool
    deduct_late_fee: Optional[bool] = None
    notes: Optional[str] = None

class GroupBalanceUpdate(BaseModel):
    new_balance: float
    reason: str

class LeavingRequest(BaseModel):
    reason: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    phone: str

class ResetPasswordRequest(BaseModel):
    phone: str
    temp_password: str
    new_password: str

class ProductCreate(BaseModel):
    title: str
    description: Optional[str] = None
    price: float
    category: str
    image_url: Optional[str] = None

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None

class ProjectCommentCreate(BaseModel):
    comment: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)

class OrderCreate(BaseModel):
    products: Optional[List[dict]] = None
    productId: Optional[str] = None
    productTitle: Optional[str] = None
    productPrice: Optional[float] = None
    sellerName: str
    buyerId: Optional[str] = None
    buyerName: Optional[str] = None
    buyerEmail: Optional[str] = None
    buyerPhone: Optional[str] = None
    note: Optional[str] = None
    total: Optional[float] = None
    status: str = "pending"

class OrderStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

class BatchOrderDelete(BaseModel):
    order_ids: List[str]

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

async def get_current_user_optional(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException as exc:
        if exc.status_code == 401:
            return None
        raise

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") not in ["admin", "super_admin", "treasurer"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def require_treasurer(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") not in ["super_admin", "treasurer"]:
        raise HTTPException(status_code=403, detail="Treasurer access required")
    return user

def save_uploaded_file(upload_file: UploadFile) -> str:
    suffix = Path(upload_file.filename).suffix or ""
    filename = f"{uuid4().hex}{suffix}"
    destination = UPLOAD_DIR / filename
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return filename

async def upload_to_cloudinary(upload_file: UploadFile, folder: str = "cash_hub/uploads") -> dict:
    if not CLOUDINARY_URL:
        logger.error("CLOUDINARY_URL not configured")
        raise HTTPException(status_code=500, detail="Cloudinary is not configured")

    logger.info(f"Starting Cloudinary upload for: {upload_file.filename}")
    file_obj = upload_file.file
    size_bytes = None
    
    if hasattr(file_obj, "seek") and hasattr(file_obj, "tell"):
        try:
            file_obj.seek(0, os.SEEK_END)
            size_bytes = file_obj.tell()
            logger.info(f"File size: {size_bytes} bytes")
            file_obj.seek(0)
        except Exception as e:
            logger.warning(f"Could not determine file size: {e}")
            size_bytes = None

    if hasattr(file_obj, "seek"):
        try:
            file_obj.seek(0)
            logger.info("File pointer reset to beginning")
        except Exception as e:
            logger.warning(f"Could not reset file pointer: {e}")

    upload_options = {
        "resource_type": "auto",
        "folder": folder,
        "use_filename": True,
        "unique_filename": True,
        "overwrite": False,
    }

    if size_bytes and size_bytes > 500 * 1024:
        logger.info("Large file detected, applying compression")
        upload_options.update({
            "quality": "auto:low",
            "fetch_format": "auto",
            "flags": "lossy",
        })

    def _upload(file_obj):
        logger.info("Calling cloudinary.uploader.upload")
        result = cloudinary.uploader.upload(file_obj, **upload_options)
        logger.info(f"Cloudinary response keys: {result.keys()}")
        return result

    result = None
    try:
        result = await anyio.to_thread.run_sync(_upload, file_obj)
        logger.info(f"Cloudinary upload successful for {upload_file.filename}")
    except Exception as e:
        logger.error(f"Cloudinary upload failed for {upload_file.filename}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {str(e)}")

    if result is None:
        raise HTTPException(status_code=500, detail="Cloudinary upload returned no result")

    secure_url = result.get("secure_url") or result.get("url")
    if not secure_url:
        logger.error(f"Cloudinary upload returned no URL. Response: {result}")
        raise HTTPException(status_code=500, detail="Cloudinary upload failed: no URL returned")

    logger.info(f"Secure URL obtained: {secure_url}")
    result["secure_url"] = secure_url
    return result

# ==================== HELPER FUNCTIONS ====================

def calculate_late_fee(day_of_month: int, num_slots: int) -> float:
    """Calculate late fee based on payment date and member's slots"""
    if day_of_month <= 10:
        return 0
    # Late fee applies after day 10: num_slots × 3,000
    return num_slots * LATE_FEE_PER_POSITION


def normalize_phone(phone: str) -> Optional[str]:
    digits = re.sub(r"\D", "", (phone or ""))
    if digits.startswith("256"):
        digits = digits[3:]
    if digits.startswith("0"):
        digits = digits[1:]
    if len(digits) > 9:
        digits = digits[-9:]
    return digits if len(digits) == 9 else None


def generate_member_code(name: Optional[str], phone: str) -> str:
    name_part = ""
    if name:
        parts = name.strip().split()
        first = parts[0] if parts else ""
        name_part = first[:3].lower() if first else ""
    digits = re.sub(r"\D", "", (phone or ""))
    phone_part = digits[-4:] if len(digits) >= 4 else digits
    return f"{name_part}{phone_part}"

async def get_or_create_user_member_code(user: Optional[dict]) -> Optional[str]:
    if not user:
        return None
    if user.get("member_code"):
        return user["member_code"]
    code = generate_member_code(user.get("name"), user.get("phone", ""))
    try:
        await db.users.update_one(
            {"_id": ObjectId(user["id"])},
            {"$set": {"member_code": code}},
        )
    except Exception:
        pass
    return code


async def migrate_normalized_phone() -> None:
    async for user in db.users.find({"normalized_phone": {"$exists": False}, "phone": {"$exists": True}}):
        normalized_phone = normalize_phone(user["phone"])
        if normalized_phone:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"normalized_phone": normalized_phone}}
            )

async def get_duplicate_normalized_phones() -> List[dict]:
    pipeline = [
        {"$match": {"normalized_phone": {"$exists": True}}},
        {"$group": {"_id": "$normalized_phone", "count": {"$sum": 1}, "ids": {"$push": "$_id"}}},
        {"$match": {"count": {"$gt": 1}}}
    ]
    return await db.users.aggregate(pipeline).to_list(100)


def calculate_months_elapsed(start_date: datetime, end_date: Optional[datetime] = None) -> int:
    end_date = end_date or datetime.now(timezone.utc)
    if end_date < start_date:
        return 0

    months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)
    if end_date.day < start_date.day:
        months -= 1

    return max(0, months)


def count_interest_periods(start_date: datetime, end_date: Optional[datetime] = None) -> int:
    end_date = end_date or datetime.now(timezone.utc)
    if end_date < start_date:
        return 0

    current = start_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    periods = 0
    while current < end_date:
        next_month = current.month + 1
        next_year = current.year + (next_month - 1) // 12
        next_month = ((next_month - 1) % 12) + 1
        current = current.replace(year=next_year, month=next_month, day=1)
        if current <= end_date:
            periods += 1
    return periods


def get_loan_months_elapsed(loan: dict) -> int:
    approved_at = loan.get("approved_at") or loan.get("created_at")
    if not approved_at:
        return 0

    try:
        approved_date = datetime.fromisoformat(approved_at.replace('Z', '+00:00'))
        today = datetime.now(timezone.utc)
        return count_interest_periods(approved_date, today)
    except ValueError:
        logger.warning("Loan has invalid approved_at date: %s", approved_at)
        return 0


def calculate_loan_interest(loan_amount: float, total_months_elapsed: int, months_to_accrue: int) -> float:
    """Calculate loan interest for a specific accrual period with tiered monthly rates."""
    if months_to_accrue <= 0 or total_months_elapsed < 0:
        return 0.0

    total_interest = 0.0
    for i in range(months_to_accrue):
        month_number = total_months_elapsed + i + 1
        if month_number <= LOAN_NORMAL_PERIOD_MONTHS:
            total_interest += loan_amount * LOAN_INTEREST_NORMAL
        else:
            total_interest += loan_amount * LOAN_INTEREST_EXTENDED
    return total_interest


def get_loan_last_interest_date(loan: dict) -> datetime:
    last_accrual = loan.get("last_interest_accrual_at") or loan.get("approved_at")
    if last_accrual:
        try:
            return datetime.fromisoformat(last_accrual.replace('Z', '+00:00'))
        except ValueError:
            logger.warning("Invalid loan date format for loan %s: %s", loan.get("id") or loan.get("_id"), last_accrual)
    return datetime.now(timezone.utc)


def get_loan_outstanding_balance(loan: dict) -> float:
    stored_balance = loan.get("outstanding_balance")
    if stored_balance is None or float(stored_balance) <= 0:
        for candidate_key in ["total_due", "initial_total_due", "amount"]:
            candidate = loan.get(candidate_key)
            if candidate is None:
                continue
            candidate_value = float(candidate)
            if candidate_value > 0:
                stored_balance = candidate_value
                break
        if stored_balance is None or float(stored_balance) <= 0:
            stored_balance = max(0, loan.get("amount", 0) - loan.get("amount_repaid", 0))
    else:
        stored_balance = float(stored_balance)

    repaid = float(loan.get("amount_repaid", 0) or 0) + float(loan.get("interest_repaid", 0) or 0)
    if stored_balance is not None and float(stored_balance) > 0:
        if loan.get("outstanding_balance") is None:
            stored_balance = max(0, float(stored_balance) - repaid)

    return float(stored_balance or 0)


async def accrue_loan_interest_on_db(loan: dict) -> dict:
    """Accrue monthly interest on an approved outstanding loan balance."""
    if loan.get("status") != "approved" or loan.get("repaid"):
        return loan

    approved_at = loan.get("approved_at")
    if not approved_at:
        logger.warning("Skipping interest accrual for approved loan with missing approved_at: %s", loan.get("id") or loan.get("_id"))
        return loan

    try:
        approved_date = datetime.fromisoformat(approved_at.replace('Z', '+00:00'))
    except ValueError:
        logger.warning("Skipping interest accrual for approved loan with invalid approved_at: %s", approved_at)
        return loan

    last_accrual_date = get_loan_last_interest_date(loan)
    months_to_accrue = count_interest_periods(last_accrual_date)
    if months_to_accrue <= 0:
        return loan

    total_months_elapsed = count_interest_periods(approved_date)
    current_balance = get_loan_outstanding_balance(loan)
    interest = calculate_loan_interest(current_balance, total_months_elapsed, months_to_accrue)
    new_balance = current_balance + interest

    update_fields = {
        "outstanding_balance": new_balance,
        "last_interest_accrual_at": datetime.now(timezone.utc).isoformat()
    }

    await db.loans.update_one(
        {"_id": ObjectId(loan["_id"])},
        {"$set": update_fields}
    )

    loan.update(update_fields)
    return loan


def is_valid_object_id(value: Optional[str]) -> bool:
    if not value:
        return False
    return ObjectId.is_valid(value)

async def get_member_guarantee_count(member_id: str) -> int:
    """Count how many active loans this member is guaranteeing"""
    count = await db.loans.count_documents({
        "guarantor_id": member_id,
        "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
        "repaid": False
    })
    return count

async def get_member_remaining_guarantee_slots(member_id: str, max_guarantees: Optional[int] = None) -> int:
    """Return how many guarantee slots remain for a member."""
    active_count = await get_member_guarantee_count(member_id)
    limit = max_guarantees if max_guarantees is not None else MAX_GUARANTEES_PER_MEMBER
    return max(0, limit - active_count)

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

async def check_and_create_auto_loan(member_id: str) -> dict:
    """Check if member should have auto-loan created (after 20th without deposit this month)"""
    today = datetime.now(timezone.utc)
    day_of_month = today.day
    
    # Only check after 20th of month
    if day_of_month <= 20:
        return {"auto_loan_created": False, "reason": "Not after 20th of month"}
    
    # Check if member has made a savings deposit this month
    month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    savings_deposit = await db.deposits.find_one({
        "user_id": member_id,
        "deposit_type": "savings",
        "status": "approved",
        "created_at": {"$gte": month_start.isoformat()}
    }) 
    
    if savings_deposit:
        return {"auto_loan_created": False, "reason": "Member already deposited this month"}
    
    # Get member details
    member = await db.users.find_one({"_id": ObjectId(member_id)})
    if not member:
        return {"auto_loan_created": False, "reason": "Member not found"}
    
    num_slots = member.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
    
    # Calculate auto-loan amount: (52,000 + 3,000 late fee + 3,000 dev fee) × num_slots
    auto_loan_amount = (MONTHLY_SAVINGS + LATE_FEE_PER_POSITION + DEVELOPMENT_FEE) * num_slots
    
    # Check if auto-loan already exists for this month
    existing_auto_loan = await db.loans.find_one({
        "user_id": member_id,
        "auto_created": True,
        "month": today.strftime("%Y-%m")
    })
    
    if existing_auto_loan:
        return {"auto_loan_created": False, "reason": "Auto-loan already exists for this month"}
    
    # Create auto-loan (pending admin approval)
    loan_doc = {
        "user_id": member_id,
        "user_name": member["name"],
        "amount": auto_loan_amount,
        "guarantor_id": None,
        "status": "pending_admin",  # Pending admin approval
        "auto_created": True,  # Flag as auto-created
        "month": today.strftime("%Y-%m"),
        "interest_rate": LOAN_INTEREST_NORMAL,
        "repaid": False,
        "amount_repaid": 0,
        "outstanding_balance": auto_loan_amount,
        "due_date": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "approved_by": None,
        "last_interest_accrual_at": None
    }
    
    result = await db.loans.insert_one(loan_doc)
    logger.info(f"Auto-loan created for member {member['name']}: UGX {auto_loan_amount:,}")
    
    return {"auto_loan_created": True, "loan_id": str(result.inserted_id), "amount": auto_loan_amount}

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    phone = user_data.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    
    email = user_data.email.lower() if user_data.email else None
    next_of_kin_name = user_data.next_of_kin_name.strip() if user_data.next_of_kin_name else None
    national_id = user_data.national_id.strip() if user_data.national_id else None

    if not next_of_kin_name:
        raise HTTPException(status_code=400, detail="Next of kin name is required")
    if national_id and len(national_id) != 14:
        raise HTTPException(status_code=400, detail="National ID must be exactly 14 characters")
    
    # Check phone uniqueness
    existing_phone = await db.users.find_one({"normalized_phone": normalized_phone})
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Check email uniqueness (if provided)
    if email:
        existing_email = await db.users.find_one({"email": email})
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "phone": phone,
        "normalized_phone": normalized_phone,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": "member",
        "membership_type": "ordinary",
        "total_savings": 0,
        "development_fund": 0,
        "total_late_fees": 0,
        "guarantees_given": 0,
        "max_guarantees": 2,
        "leaving_requested": False,
        "member_code": generate_member_code(user_data.name, phone),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    if email:
        user_doc["email"] = email
    user_doc["next_of_kin_name"] = next_of_kin_name
    if national_id:
        user_doc["national_id"] = national_id
    
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email or phone)
    refresh_token = create_refresh_token(user_id)
    
    return {
        "id": user_id,
        "email": email,
        "phone": phone,
        "name": user_data.name,
        "next_of_kin_name": next_of_kin_name,
        "national_id": national_id,
        "role": "member",
        "membership_type": "ordinary",
        "member_code": user_doc.get("member_code"),
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    identifier = credentials.identifier.strip()
    
    normalized_identifier = normalize_phone(identifier)
    user = None
    if normalized_identifier:
        user = await db.users.find_one({"normalized_phone": normalized_identifier})
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
        "member_code": user.get("member_code"),
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    code = await get_or_create_user_member_code(user)
    data = dict(user)
    data["member_code"] = code
    return data

@api_router.post("/auth/logout")
async def logout():
    return {"message": "Logged out successfully"}

def generate_temp_password(length: int = 6) -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(length))

def phone_to_whatsapp(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("0"):
        digits = "256" + digits[1:]
    elif not digits.startswith("256"):
        digits = "256" + digits
    return digits

async def send_whatsapp_message(phone: str, message: str) -> bool:
    try:
        wa_number = phone_to_whatsapp(phone)
        wa_url = f"https://wa.me/{wa_number}?text={quote(message)}"
        import webbrowser
        webbrowser.open(wa_url)
        logger.info(f"WhatsApp link opened for {wa_number}: {wa_url}")
        return True
    except Exception as e:
        logger.warning(f"WhatsApp send failed: {e}")
        return False

async def send_email_otp(email: str, temp_password: str) -> bool:
    try:
        smtp_host = os.environ.get("SMTP_HOST")
        smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        smtp_user = os.environ.get("SMTP_USER")
        smtp_pass = os.environ.get("SMTP_PASS")
        if not smtp_user or not smtp_pass:
            return False
        msg = MIMEMultipart()
        msg["From"] = smtp_user
        msg["To"] = email
        msg["Subject"] = "Password Recovery - Class One Savings"
        body = f"Your temporary password is: {temp_password}\n\nThis password expires in 3 minutes. Use it to reset your account password."
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, email, msg.as_string())
        return True
    except Exception as e:
        logger.warning(f"Email send failed: {e}")
        return False

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    phone = request.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    user = await db.users.find_one({"normalized_phone": normalized_phone})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this phone number")
    temp_password = generate_temp_password()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=3)
    await db.password_resets.update_one(
        {"phone": normalized_phone},
        {"$set": {
            "temp_password": hash_password(temp_password),
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "used": False
        }},
        upsert=True
    )
    wa_number = phone_to_whatsapp(user.get("phone", phone))
    message = f"Your Class One Savings temporary password is: {temp_password}\n\nThis password expires in 3 minutes. Use it to reset your account password."
    wa_url = f"https://wa.me/{wa_number}?text={quote(message)}"
    return {
        "message": "If an account exists with this phone number, a temporary password has been sent.",
        "temp_password": temp_password,
        "whatsapp_url": wa_url,
        "expires_in_minutes": 3
    }

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    phone = request.phone.strip()
    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    reset_record = await db.password_resets.find_one({"phone": normalized_phone, "used": False})
    if not reset_record:
        raise HTTPException(status_code=400, detail="No active password reset found. Please request a new one.")
    expires_at = datetime.fromisoformat(reset_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        await db.password_resets.delete_one({"_id": reset_record["_id"]})
        raise HTTPException(status_code=400, detail="Temporary password has expired. Please request a new one.")
    if not verify_password(request.temp_password, reset_record["temp_password"]):
        raise HTTPException(status_code=400, detail="Invalid temporary password")
    user = await db.users.find_one({"normalized_phone": normalized_phone})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_password_hash = hash_password(request.new_password)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": new_password_hash}}
    )
    await db.password_resets.update_one(
        {"_id": reset_record["_id"]},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Password reset successfully"}

# ==================== MEMBER ENDPOINTS ====================

@api_router.get("/members")
async def get_members(user: dict = Depends(get_current_user)):
    members = await db.users.find({"role": {"$nin": ["super_admin", "treasurer"]}}, {"password_hash": 0}).to_list(1000)
    result = []
    is_treasurer = user.get("role") in ["super_admin", "treasurer"]
    
    for m in members:
        m["id"] = str(m["_id"])
        m.pop("_id", None)
        # Hide admin role from non-super-admins
        if not is_treasurer and m.get("role") == "admin":
            m["role"] = "member"
        max_guarantees = m.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
        m["remaining_guarantee_slots"] = await get_member_remaining_guarantee_slots(m["id"], max_guarantees)
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
    if user.get("role") not in ["super_admin", "treasurer"] and member.get("role") in ["admin", "super_admin", "treasurer"]:
        member["role"] = "member"
    max_guarantees = member.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
    member["remaining_guarantee_slots"] = await get_member_remaining_guarantee_slots(member["id"], max_guarantees)
    return member

@api_router.post("/products")
async def create_product(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    price: float = Form(...),
    category: str = Form(...),
    user: dict = Depends(get_current_user),
    images: List[UploadFile] = File(default=[]),
):
    image_urls = []
    if images:
        for img in images:
            if img and img.filename:
                upload_result = await upload_to_cloudinary(img)
                url = upload_result.get("secure_url") or upload_result.get("url")
                if url:
                    image_urls.append(url)

    product_data = {
        "title": title,
        "description": description,
        "price": price,
        "category": category,
        "image_url": image_urls[0] if image_urls else None,
        "image_urls": image_urls,
        "seller_id": user.get("id"),
        "sellerName": user.get("name", user.get("full_name", "Member")),
        "seller_name": user.get("name", user.get("full_name", "Member")),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = await db.products.insert_one(product_data)
        logger.info(f"Product created: {title}")
    except Exception as e:
        logger.exception("Failed to save product")
        raise HTTPException(status_code=500, detail=f"Failed to save product: {str(e)}")

    product_data["id"] = str(result.inserted_id)
    product_data.pop("_id", None)
    return product_data

@api_router.get("/products")
async def list_products(user: Optional[dict] = Depends(get_current_user_optional)):
    query = {}
    is_admin = user and user.get("role") in ["admin", "super_admin", "treasurer"]
    if not is_admin:
        query = {"$or": [{"sold_out": {"$exists": False}}, {"sold_out": False}]}
    products = await db.products.find(query).sort("created_at", -1).to_list(200)
    for product in products:
        product["id"] = str(product["_id"])
        product.pop("_id", None)
    return products

@api_router.get("/products/me")
async def list_my_products(user: dict = Depends(get_current_user)):
    products = await db.products.find({"seller_id": user["id"]}).sort("created_at", -1).to_list(200)
    for product in products:
        product["id"] = str(product["_id"])
        product.pop("_id", None)
    return products

@api_router.post("/projects")
async def create_project(project: ProjectCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "member":
        raise HTTPException(status_code=403, detail="Members only")

    try:
        title = project.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Project title is required")

        project_id = None
        project_data = {
            "title": title,
            "description": project.description.strip() if project.description else None,
            "category": project.category.strip() if project.category else None,
            "author_id": user["id"],
            "author_name": user.get("name") or user.get("full_name") or "Member",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        result = await db.projects.insert_one(project_data)
        project_id = str(result.inserted_id)
        project_data["id"] = project_id
        project_data["project_id"] = project_id

        # Ensure we don't accidentally include any non-serializable BSON types
        for k, v in list(project_data.items()):
            if isinstance(v, ObjectId):
                project_data[k] = str(v)

        return project_data
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to create project", exc_info=True)
        # Return the original exception message to help debugging (temporary)
        raise HTTPException(status_code=500, detail=str(exc))

@api_router.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    if user.get("role") != "member":
        raise HTTPException(status_code=403, detail="Members only")

    projects = await db.projects.find({}).sort("created_at", -1).to_list(200)
    project_ids = [str(project.get("project_id") or project.get("id") or str(project.get("_id"))) for project in projects]
    comments = []
    if project_ids:
        comments = await db.project_comments.find({"project_id": {"$in": project_ids}}).sort("created_at", -1).to_list(500)

    comments_by_project = {}
    for comment in comments:
        comment["id"] = str(comment["_id"])
        comment.pop("_id", None)
        comments_by_project.setdefault(comment["project_id"], []).append(comment)

    result = []
    for project in projects:
        project_id = str(project.get("project_id") or project.get("id") or str(project.get("_id")))
        project["id"] = project_id
        project.pop("_id", None)
        project["project_id"] = project_id
        project_comments = comments_by_project.get(project_id, [])
        project["comments"] = project_comments
        project["rating_count"] = len(project_comments)
        project["average_rating"] = (
            round(sum((c.get("rating") or 0) for c in project_comments) / len(project_comments), 2)
            if project_comments else 0
        )
        result.append(project)
    return result

@api_router.post("/projects/{project_id}/comments")
async def add_project_comment(project_id: str, comment: ProjectCommentCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "member":
        raise HTTPException(status_code=403, detail="Members only")

    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    comment_data = {
        "project_id": project_id,
        "user_id": user["id"],
        "user_name": user.get("name") or user.get("full_name") or "Member",
        "comment": comment.comment.strip() if comment.comment else None,
        "rating": comment.rating,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.project_comments.insert_one(comment_data)
    comment_data["id"] = str(result.inserted_id)
    return comment_data

@api_router.get("/projects/{project_id}/comments")
async def list_project_comments(project_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "member":
        raise HTTPException(status_code=403, detail="Members only")

    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    comments = await db.project_comments.find({"project_id": project_id}).sort("created_at", -1).to_list(200)
    for comment in comments:
        comment["id"] = str(comment["_id"])
        comment.pop("_id", None)
    return comments

@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    from bson import ObjectId
    if not ObjectId.is_valid(product_id):
        return {}
    product = await db.products.find_one({"_id": ObjectId(product_id)})
    if not product:
        return {}
    product["id"] = str(product["_id"])
    product.pop("_id", None)
    return product

@api_router.post("/orders")
async def create_order(order: OrderCreate, user: Optional[dict] = Depends(get_current_user_optional)):
    order_doc = {
        "products": order.products,
        "productId": order.productId,
        "productTitle": order.productTitle,
        "productPrice": order.productPrice,
        "sellerName": (order.sellerName or "").strip(),
        "buyerId": order.buyerId,
        "buyerName": order.buyerName,
        "buyerEmail": order.buyerEmail,
        "buyerPhone": order.buyerPhone,
        "note": order.note,
        "total": order.total,
        "status": order.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if user:
        order_doc["buyerId"] = user["id"]
        order_doc["created_by"] = user["id"]
        if not order_doc.get("buyerName"):
            order_doc["buyerName"] = user["name"]

    result = await db.orders.insert_one(order_doc)
    order_doc["id"] = str(result.inserted_id)
    order_doc.pop("_id", None)
    
    # Send WebSocket notification to seller
    await manager.broadcast_to_seller(order_doc["sellerName"], {
        "type": "new_order",
        "order": order_doc
    })
    
    return order_doc

@api_router.get("/orders")
async def get_orders(user: Optional[dict] = Depends(get_current_user_optional)):
    if not user:
        return []

    if user.get("role") in ["admin", "super_admin", "treasurer"]:
        orders = await db.orders.find({"deleted": {"$ne": True}}).sort("created_at", -1).to_list(1000)
    else:
        orders = await db.orders.find({
            "$and": [
                {"deleted": {"$ne": True}},
                {
                    "$or": [
                        {"buyerId": user["id"]},
                        {"sellerName": {"$regex": f"^{re.escape((user['name'] or '').strip())}$", "$options": "i"}}
                    ]
                }
            ]
        }).sort("created_at", -1).to_list(1000)

    for order in orders:
        order["id"] = str(order["_id"])
        order.pop("_id", None)
    return orders

@api_router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, data: OrderStatusUpdate, user: Optional[dict] = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_admin = user.get("role") in ["admin", "super_admin", "treasurer"]
    is_seller = (order.get("sellerName") or "").strip().lower() == (user.get("name") or "").strip().lower()

    if not is_admin and not is_seller:
        raise HTTPException(status_code=403, detail="You can only update your own orders")

    allowed_statuses = ["pending", "approved", "rejected"]
    if data.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(allowed_statuses)}")

    update_fields = {"status": data.status}
    if data.notes:
        update_fields["note"] = data.notes

    await db.orders.update_one(
        {"_id": ObjectId(order_id)},
        {"$set": update_fields}
    )

    return {"message": f"Order {data.status}"}

@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user: Optional[dict] = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order id")

    order = await db.orders.find_one({"_id": oid})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_admin = user.get("role") in ["admin", "super_admin", "treasurer"]
    is_seller = (order.get("sellerName") or "").strip().lower() == (user.get("name") or "").strip().lower()
    is_buyer = order.get("buyerId") == user.get("id") or order.get("created_by") == user.get("id")

    if not (is_admin or is_seller or is_buyer):
        raise HTTPException(status_code=403, detail="You can only delete your own orders")

    result = await db.orders.update_one(
        {"_id": oid},
        {"$set": {
            "deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user.get("name") or user.get("id"),
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")

    return {"message": "Order deleted", "id": order_id}

@api_router.get("/orders/deleted")
async def get_deleted_orders(user: dict = Depends(require_treasurer)):
    orders = await db.orders.find({"deleted": True}).sort("created_at", -1).to_list(1000)
    for order in orders:
        order["id"] = str(order["_id"])
        order.pop("_id", None)
    return orders

@api_router.delete("/orders/{order_id}/permanent")
async def permanent_delete_order(order_id: str, user: dict = Depends(require_treasurer)):
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order id")

    result = await db.orders.delete_one({"_id": oid})
    if result.deleted_count == 0:
        fallback = await db.orders.find_one({"id": order_id})
        if fallback:
            await db.orders.delete_one({"_id": fallback["_id"]})
            return {"message": "Order permanently deleted", "id": order_id}
        raise HTTPException(status_code=404, detail="Order not found")

    return {"message": "Order permanently deleted", "id": order_id}

@api_router.post("/orders/batch-permanent")
async def batch_permanent_delete_orders(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for order_id in data.order_ids:
        try:
            oid = ObjectId(order_id)
        except Exception:
            errors.append({"id": order_id, "error": "Invalid order id"})
            continue
        result = await db.orders.delete_one({"_id": oid})
        if result.deleted_count == 0:
            fallback = await db.orders.find_one({"id": order_id})
            if fallback:
                await db.orders.delete_one({"_id": fallback["_id"]})
                deleted_ids.append(order_id)
            else:
                errors.append({"id": order_id, "error": "Order not found"})
        else:
            deleted_ids.append(order_id)
    return {"deleted": deleted_ids, "errors": errors}

@api_router.post("/uploads")
async def upload_media(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    logger.info(f"Upload started for file: {file.filename}, user: {user['id']}")
    
    try:
        upload_result = await upload_to_cloudinary(file)
        logger.info(f"Cloudinary upload successful: public_id={upload_result.get('public_id')}")
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File upload to cloud failed: {str(e)}")
    
    url = upload_result.get("secure_url") or upload_result.get("url")
    if not url:
        logger.error(f"No URL in Cloudinary response: {upload_result}")
        raise HTTPException(status_code=500, detail="Cloud upload returned no URL")
    
    upload_metadata = {
        "file_name": file.filename,
        "content_type": file.content_type,
        "url": url,
        "cloudinary": {
            "public_id": upload_result.get("public_id"),
            "resource_type": upload_result.get("resource_type"),
            "format": upload_result.get("format"),
            "bytes": upload_result.get("bytes"),
            "width": upload_result.get("width"),
            "height": upload_result.get("height"),
            "secure_url": upload_result.get("secure_url"),
            "original_filename": upload_result.get("original_filename"),
            "folder": upload_result.get("folder"),
            "type": upload_result.get("type"),
        },
        "uploaded_by": user["id"],
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = await db.uploads.insert_one(upload_metadata)
        logger.info(f"Upload metadata saved to MongoDB: {result.inserted_id}")
    except Exception as e:
        logger.exception("Failed to save upload metadata")
        raise HTTPException(status_code=500, detail=f"Failed to save file metadata: {str(e)}")

    upload_metadata["id"] = str(result.inserted_id)
    upload_metadata.pop("_id", None)
    return upload_metadata

@api_router.get("/debug/cloudinary-status")
async def cloudinary_status(user: dict = Depends(require_treasurer)):
    is_configured = bool(CLOUDINARY_URL)
    status = {
        "cloudinary_configured": is_configured,
        "cloudinary_url_present": is_configured,
    }
    
    if is_configured:
        try:
            config = cloudinary.config()
            status["cloudinary_cloud_name"] = config.cloud_name
            status["cloudinary_api_key"] = "***" if config.api_key else None
            status["status"] = "OK - Cloudinary is configured"
        except Exception as e:
            status["status"] = f"ERROR - {str(e)}"
            status["error"] = str(e)
    else:
        status["status"] = "ERROR - Cloudinary is not configured"
        status["message"] = "CLOUDINARY_URL environment variable is not set"
    
    return status

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": oid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    is_admin = user.get("role") in ["admin", "super_admin", "treasurer"]
    is_owner = product.get("seller_id") == user.get("id")

    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="You can only delete your own products")

    result = await db.products.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    return {"message": "Product deleted", "id": product_id}

@api_router.post("/products/batch-delete")
async def batch_delete_products(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for product_id in data.order_ids:
        try:
            oid = ObjectId(product_id)
        except Exception:
            errors.append({"id": product_id, "error": "Invalid product id"})
            continue
        product = await db.products.find_one({"_id": oid})
        if not product:
            errors.append({"id": product_id, "error": "Product not found"})
            continue
        result = await db.products.delete_one({"_id": oid})
        if result.deleted_count > 0:
            deleted_ids.append(product_id)
        else:
            errors.append({"id": product_id, "error": "Delete failed"})
    return {"deleted": deleted_ids, "errors": errors}

@api_router.post("/deposits/batch-delete")
async def batch_delete_deposits(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for deposit_id in data.order_ids:
        try:
            oid = ObjectId(deposit_id)
        except Exception:
            errors.append({"id": deposit_id, "error": "Invalid deposit id"})
            continue
        deposit = await db.deposits.find_one({"_id": oid})
        if not deposit:
            errors.append({"id": deposit_id, "error": "Deposit not found"})
            continue
        # If approved, reverse balance changes
        if deposit.get("status") == "approved":
            if deposit.get("deposit_type") == "development_fee":
                await db.users.update_one(
                    {"_id": ObjectId(deposit["user_id"])},
                    {"$inc": {"development_fund": -deposit["amount"]}}
                )
            elif deposit.get("deposit_type") in ["loan_payment", "interest_payment"]:
                pass  # Loan payments and interest are not reversible
            else:  # savings
                # Reverse only what was actually applied at approval time
                if deposit.get("late_fee_applied", False):
                    late_fee_amount = deposit.get("late_fee", 0)
                    await db.users.update_one(
                        {"_id": ObjectId(deposit["user_id"])},
                        {"$inc": {
                            "total_savings": -(deposit["amount"] - late_fee_amount),
                            "total_late_fees": -late_fee_amount
                        }}
                    )
                else:
                    await db.users.update_one(
                        {"_id": ObjectId(deposit["user_id"])},
                        {"$inc": {"total_savings": -deposit["amount"]}}
                    )
        result = await db.deposits.delete_one({"_id": oid})
        if result.deleted_count > 0:
            deleted_ids.append(deposit_id)
        else:
            errors.append({"id": deposit_id, "error": "Delete failed"})
    return {"deleted": deleted_ids, "errors": errors}

@api_router.delete("/sellers")
async def delete_all_sellers(user: dict = Depends(require_treasurer)):
    result = await db.users.delete_many({"membership_type": "seller"})
    return {"message": f"Deleted {result.deleted_count} seller(s)", "deleted_count": result.deleted_count}

@api_router.delete("/products")
async def delete_all_products(user: dict = Depends(require_treasurer)):
    result = await db.products.delete_many({})
    return {"message": f"Deleted {result.deleted_count} product(s)", "deleted_count": result.deleted_count}

@api_router.patch("/products/{product_id}")
async def update_product(product_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": oid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    is_admin = user.get("role") in ["admin", "super_admin", "treasurer"]
    is_owner = product.get("seller_id") == user.get("id")
    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="You can only update your own products")

    # Whitelist updatable fields
    allowed_fields = {"sold_out", "title", "description", "price", "category", "image_url", "image_urls"}
    update_fields = {k: v for k, v in (payload or {}).items() if k in allowed_fields}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    await db.products.update_one({"_id": oid}, {"$set": update_fields})

    updated = await db.products.find_one({"_id": oid})
    updated["id"] = str(updated["_id"])
    updated.pop("_id", None)
    return updated

@api_router.delete("/members/{member_id}")
async def delete_member(member_id: str, user: dict = Depends(require_treasurer)):
    if member_id == user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    member = await db.users.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if member.get("role") in ["super_admin", "treasurer"]:
        raise HTTPException(status_code=400, detail="Cannot delete Treasurer")
    
    await db.users.delete_one({"_id": ObjectId(member_id)})
    return {"message": "Member deleted successfully"}

# ==================== ADMIN MANAGEMENT ====================

@api_router.post("/admin/set-role")
async def set_user_role(data: RoleUpdate, user: dict = Depends(require_treasurer)):
    if data.new_role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    target_user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("role") in ["super_admin", "treasurer"]:
        raise HTTPException(status_code=400, detail="Cannot change Treasurer role")
    
    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": {"role": data.new_role}}
    )
    return {"message": f"User role updated to {data.new_role}"}

@api_router.post("/admin/set-membership")
async def set_membership_type(data: MembershipUpdate, user: dict = Depends(require_admin)):
    if data.membership_type not in ["premium", "ordinary", "seller"]:
        raise HTTPException(status_code=400, detail="Invalid membership type")
    
    target_user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": {"membership_type": data.membership_type}}
    )
    return {"message": f"Membership updated to {data.membership_type}"}

@api_router.post("/admin/set-max-guarantees")
async def set_max_guarantees(data: MaxGuaranteesUpdate, user: dict = Depends(require_treasurer)):
    if data.max_guarantees < 0:
        raise HTTPException(status_code=400, detail="Max guarantees cannot be negative")
    
    target_user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    logger.info(f"Updating max_guarantees for user {target_user.get('name')} from {target_user.get('max_guarantees')} to {data.max_guarantees}")
    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": {"max_guarantees": data.max_guarantees}}
    )
    return {"message": f"Max guarantees updated to {data.max_guarantees}"}

@api_router.post("/admin/update-group-balance")
async def update_group_balance(data: GroupBalanceUpdate, user: dict = Depends(require_treasurer)):
    """Treasurer can reset/edit total group balance (for year end)"""
    await db.settings.update_one(
        {"key": "group_balance"},
        {"$set": {"value": data.new_balance, "updated_at": datetime.now(timezone.utc).isoformat(), "reason": data.reason}},
        upsert=True
    )
    return {"message": f"Group balance updated to {data.new_balance}"}

# ==================== DEPOSIT ENDPOINTS ====================

async def get_monthly_development_fee_applied(user_id: str, month: str) -> float:
    deposits = await db.deposits.find({
        "user_id": user_id,
        "month": month,
        "status": "approved",
        "development_fee_amount": {"$gt": 0}
    }).to_list(1000)
    return sum(float(d.get("development_fee_amount", 0) or 0) for d in deposits)


@api_router.post("/deposits/request")
async def request_deposit(deposit: DepositRequest, user: dict = Depends(get_current_user)):
    if deposit.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    deposit_type = "savings" if deposit.deposit_type == "development_fee" else deposit.deposit_type
    allowed_deposit_types = ["savings", "loan_payment", "interest_payment"]
    if deposit_type not in allowed_deposit_types:
        raise HTTPException(status_code=400, detail="Invalid deposit type")

    target_user = user
    if deposit.target_user_id:
        if user.get("role") not in ["super_admin", "treasurer"]:
            raise HTTPException(status_code=403, detail="Only Treasurer can deposit for other members")
        if not is_valid_object_id(deposit.target_user_id):
            raise HTTPException(status_code=400, detail="Invalid target user id")
        target_user = await db.users.find_one({"_id": ObjectId(deposit.target_user_id)})
        if not target_user:
            raise HTTPException(status_code=404, detail="Target member not found")
        target_user["id"] = str(target_user["_id"])
        target_user.pop("_id", None)
    
    # Calculate late fee if applicable
    today = datetime.now(timezone.utc)
    day_of_month = today.day
    late_fee = 0
    num_slots = target_user.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
    
    if deposit_type == "savings":
        # Non-premium members may save any amount with a minimum of 500 UGX.
        if target_user.get("membership_type") != "premium":
            minimum_required = 500
        else:
            minimum_required = MONTHLY_SAVINGS * num_slots

        if deposit.amount < minimum_required:
            raise HTTPException(status_code=400, detail=f"Minimum savings amount is UGX {minimum_required:,}")
        
        # Get member's slots (max_guarantees) for late fee calculation
        if day_of_month > 10:
            late_fee = calculate_late_fee(day_of_month, num_slots)
            if deposit.deduct_late_fee and deposit.amount < late_fee:
                raise HTTPException(
                    status_code=400,
                    detail=f"Amount must be at least UGX {late_fee:,} to cover the late fee when deducting it from this deposit"
                )
    elif deposit_type == "development_fee":
        if deposit.amount < DEVELOPMENT_FEE:
            raise HTTPException(status_code=400, detail=f"Development fee is UGX {DEVELOPMENT_FEE:,}")
    else:
        # loan_payment and interest_payment requests are allowed without savings minimum
        late_fee = 0
    
    deposit_doc = {
        "user_id": target_user["id"],
        "user_name": target_user["name"],
        "user_email": target_user.get("email"),
        "amount": deposit.amount,
        "deposit_type": deposit_type,
        "late_fee": late_fee,
        "deduct_late_fee": bool(deposit.deduct_late_fee),
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
async def get_deposits(user: dict = Depends(get_current_user), month: Optional[str] = Query(None)):
    query = {}
    if user.get("role") not in ["admin", "super_admin", "treasurer"]:
        query["user_id"] = user["id"]
    if month:
        query["month"] = month
    
    deposits = await db.deposits.find(query).to_list(1000)
    
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
    
    deduct_late_fee = approval.deduct_late_fee
    if deduct_late_fee is None:
        deduct_late_fee = deposit.get("deduct_late_fee", False)

    update_fields = {
        "status": new_status,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": user["id"],
        "notes": approval.notes
    }
    if approval.approved and deposit.get("deposit_type") == "savings":
        update_fields["deduct_late_fee"] = deduct_late_fee
        if deduct_late_fee:
            update_fields["late_fee_applied"] = True

    await db.deposits.update_one(
        {"_id": ObjectId(approval.transaction_id)},
        {"$set": update_fields}
    )
    
    if approval.approved:

        if deposit.get("deposit_type") == "development_fee":
            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$inc": {"development_fund": deposit["amount"]}}
            )
        elif deposit.get("deposit_type") in ["loan_payment", "interest_payment"]:
            user_loans = await db.loans.find({
                "user_id": deposit["user_id"],
                "status": "approved",
                "repaid": False
            }).to_list(100)

            remaining_payment = deposit["amount"]
            for loan in user_loans:
                if remaining_payment <= 0:
                    break

                loan = await accrue_loan_interest_on_db(loan)
                outstanding_balance = get_loan_outstanding_balance(loan)

                if outstanding_balance <= 0:
                    await db.loans.update_one(
                        {"_id": ObjectId(loan["_id"])},
                        {"$set": {"repaid": True, "repaid_at": datetime.now(timezone.utc).isoformat(), "status": "repaid"}}
                    )
                    await db.users.update_one(
                        {"_id": ObjectId(loan["guarantor_id"])},
                        {"$inc": {"guarantees_given": -1}}
                    )
                    continue

                payment_to_apply = min(remaining_payment, outstanding_balance)
                new_balance = max(0, outstanding_balance - payment_to_apply)

                update_obj = {
                    "$set": {"outstanding_balance": new_balance},
                    "$inc": {"amount_repaid": payment_to_apply}
                }
                if new_balance <= 0:
                    update_obj["$set"].update({
                        "repaid": True,
                        "repaid_at": datetime.now(timezone.utc).isoformat(),
                        "status": "repaid"
                    })

                await db.loans.update_one(
                    {"_id": ObjectId(loan["_id"])},
                    update_obj
                )

                if new_balance <= 0:
                    await db.users.update_one(
                        {"_id": ObjectId(loan["guarantor_id"])},
                        {"$inc": {"guarantees_given": -1}}
                    )

                remaining_payment -= payment_to_apply

            # If payment exceeds loan amounts, add excess to savings
            if remaining_payment > 0:
                await db.users.update_one(
                    {"_id": ObjectId(deposit["user_id"])},
                    {"$inc": {"total_savings": remaining_payment}}
                )
        else:  # savings
            deduct_late_fee = deduct_late_fee and deposit.get("late_fee", 0) > 0
            late_fee_amount = min(deposit.get("late_fee", 0), deposit["amount"]) if deduct_late_fee else 0
            remaining_after_late_fee = max(0, deposit["amount"] - late_fee_amount)

            member = await db.users.find_one({"_id": ObjectId(deposit["user_id"])})
            num_slots = member.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER) if member else MAX_GUARANTEES_PER_MEMBER
            monthly_development_fee_cap = DEVELOPMENT_FEE * num_slots
            monthly_development_fee_applied = await get_monthly_development_fee_applied(deposit["user_id"], deposit.get("month"))
            remaining_development_fee_cap = max(0, monthly_development_fee_cap - monthly_development_fee_applied)
            development_fee_amount = min(remaining_development_fee_cap, remaining_after_late_fee)
            savings_amount = max(0, remaining_after_late_fee - development_fee_amount)

            balance_updates = {"total_savings": savings_amount}
            if late_fee_amount > 0:
                balance_updates["total_late_fees"] = late_fee_amount
            if development_fee_amount > 0:
                balance_updates["development_fund"] = development_fee_amount

            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$inc": balance_updates}
            )

            update_fields["development_fee_amount"] = development_fee_amount
            update_fields["development_fee_applied"] = development_fee_amount > 0
            await db.deposits.update_one(
                {"_id": ObjectId(approval.transaction_id)},
                {"$set": update_fields}
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
    """Delete a deposit. Members can delete own pending/rejected; Treasurer can delete any."""
    deposit = await db.deposits.find_one({"_id": ObjectId(deposit_id)})
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    is_treasurer = user.get("role") in ["super_admin", "treasurer"]
    is_owner = deposit.get("user_id") == user["id"]
    
    if not is_treasurer:
        if not is_owner:
            raise HTTPException(status_code=403, detail="You can only delete your own records")
        if deposit.get("status") == "approved":
            raise HTTPException(status_code=403, detail="Approved deposits can only be deleted by Treasurer")
    
    # If approved, reverse the balance changes
    if deposit.get("status") == "approved":
        if deposit.get("deposit_type") == "development_fee":
            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$inc": {"development_fund": -deposit["amount"]}}
            )
        else:
            late_fee_amount = deposit.get("late_fee", 0) if deposit.get("late_fee_applied", False) else 0
            development_fee_amount = deposit.get("development_fee_amount", 0) or 0
            savings_amount = max(0, deposit["amount"] - late_fee_amount - development_fee_amount)

            balance_updates = {"total_savings": -savings_amount}
            if late_fee_amount > 0:
                balance_updates["total_late_fees"] = -late_fee_amount
            if development_fee_amount > 0:
                balance_updates["development_fund"] = -development_fee_amount

            await db.users.update_one(
                {"_id": ObjectId(deposit["user_id"])},
                {"$inc": balance_updates}
            )
    
    await db.deposits.delete_one({"_id": ObjectId(deposit_id)})
    return {"message": "Deposit deleted"}

@api_router.post("/deposits/check-auto-loan")
async def check_auto_loan(request_data: dict, user: dict = Depends(get_current_user)):
    """Check if member should have auto-loan created and create if needed"""
    # Allow member to check their own or admin to check for anyone
    target_member_id = request_data.get("member_id") or user["id"]
    
    if user.get("role") not in ["admin", "super_admin", "treasurer"] and target_member_id != user["id"]:
        raise HTTPException(status_code=403, detail="Can only check auto-loan for yourself or admins can check for others")
    
    if not is_valid_object_id(target_member_id):
        raise HTTPException(status_code=400, detail="Invalid member id")
    
    result = await check_and_create_auto_loan(target_member_id)
    return result

# ==================== LOAN ENDPOINTS ====================

@api_router.post("/loans/request")
async def request_loan(loan: LoanRequest, user: dict = Depends(get_current_user)):
    if user.get("membership_type") != "premium":
        raise HTTPException(status_code=403, detail="Only premium members can request loans")
    
    if loan.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    user_max_guarantees = user.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
    user_max_loan = MAX_LOAN_AMOUNT * user_max_guarantees
    if loan.amount > user_max_loan:
        raise HTTPException(status_code=400, detail=f"Maximum loan for your {user_max_guarantees} slot(s) is UGX {user_max_loan:,}")
    
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
    max_guarantees = guarantor.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
    guarantor_savings = guarantor.get("total_savings", 0)

    logger.info(f"Loan request: Guarantor {guarantor.get('name')} has {guarantee_count} guarantees, max allowed: {max_guarantees}")
    if guarantee_count >= max_guarantees:
        raise HTTPException(status_code=400, detail=f"This member already guarantees {max_guarantees} loans")

    if ((guarantor.get("membership_type", "") or "").lower() != "premium"):
        if guarantor_savings * 2 < loan.amount:
            raise HTTPException(
                status_code=400,
                detail="Guarantor must have savings equal to at least 50% of the requested loan amount"
            )
    
    # Auto-calculate interest and total due (first month 3%)
    interest_amount = loan.amount * LOAN_INTEREST_NORMAL
    total_due = loan.amount + interest_amount
    
    loan_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user.get("email"),
        "amount": loan.amount,
        "outstanding_balance": loan.amount,
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
        "last_interest_accrual_at": None,
        "due_date": None,
        "approved_by": None
    }
    
    result = await db.loans.insert_one(loan_doc)
    loan_doc["id"] = str(result.inserted_id)
    loan_doc.pop("_id", None)

    return loan_doc


@api_router.post("/loans/admin/create")
async def admin_create_loan(data: AdminLoanCreate, user: dict = Depends(require_admin)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    if not is_valid_object_id(data.member_id):
        raise HTTPException(status_code=400, detail="Invalid member id")

    member = await db.users.find_one({"_id": ObjectId(data.member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member_max_guarantees = member.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
    member_max_loan = MAX_LOAN_AMOUNT * member_max_guarantees
    if data.amount > member_max_loan:
        raise HTTPException(status_code=400, detail=f"Maximum loan for this member's {member_max_guarantees} slot(s) is UGX {member_max_loan:,}")

    existing_loan = await db.loans.find_one({
        "user_id": data.member_id,
        "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
        "repaid": False
    })
    if existing_loan:
        raise HTTPException(status_code=400, detail="Member already has an active or pending loan")

    guarantor = None
    if data.guarantor_id:
        if not is_valid_object_id(data.guarantor_id):
            raise HTTPException(status_code=400, detail="Invalid guarantor id")
        if data.guarantor_id == data.member_id:
            raise HTTPException(status_code=400, detail="Member cannot be their own guarantor")

        guarantor = await db.users.find_one({"_id": ObjectId(data.guarantor_id)})
        if not guarantor:
            raise HTTPException(status_code=404, detail="Guarantor not found")

        guarantee_count = await get_member_guarantee_count(data.guarantor_id)
        max_guarantees = guarantor.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
        if guarantee_count >= max_guarantees:
            raise HTTPException(status_code=400, detail=f"This member already guarantees {max_guarantees} loans")

        if ((guarantor.get("membership_type", "") or "").lower() != "premium"):
            guarantor_savings = guarantor.get("total_savings", 0)
            if guarantor_savings * 2 < data.amount:
                raise HTTPException(
                    status_code=400,
                    detail="Guarantor must have savings equal to at least 50% of the loan amount"
                )

    interest_amount = data.amount * LOAN_INTEREST_NORMAL
    total_due = data.amount + interest_amount
    now_iso = datetime.now(timezone.utc).isoformat()
    due_date = (datetime.now(timezone.utc) + timedelta(days=120)).isoformat()

    loan_doc = {
        "user_id": data.member_id,
        "user_name": member["name"],
        "user_email": member.get("email"),
        "amount": data.amount,
        "outstanding_balance": total_due,
        "interest_rate": LOAN_INTEREST_NORMAL,
        "initial_interest": interest_amount,
        "initial_total_due": total_due,
        "guarantor_id": data.guarantor_id,
        "guarantor_name": guarantor["name"] if guarantor else None,
        "reason": data.reason,
        "status": "approved",
        "guarantor_approved": bool(guarantor),
        "guarantor_approved_at": now_iso if guarantor else None,
        "repaid": False,
        "amount_repaid": 0,
        "created_at": now_iso,
        "approved_at": now_iso,
        "last_interest_accrual_at": now_iso,
        "due_date": due_date,
        "approved_by": user["id"],
    }

    result = await db.loans.insert_one(loan_doc)

    if guarantor:
        await db.users.update_one(
            {"_id": ObjectId(data.guarantor_id)},
            {"$inc": {"guarantees_given": 1}}
        )

    loan_doc["id"] = str(result.inserted_id)
    loan_doc.pop("_id", None)
    return loan_doc


async def accrue_quick_loan_interest(quick_loan):
    if quick_loan.get("status") != "approved" or quick_loan.get("repaid"):
        return quick_loan

    approved_at = quick_loan.get("approved_at")
    if not approved_at:
        return quick_loan

    period = quick_loan.get("interest_period", "2_weeks")
    amount = quick_loan.get("amount", 0)
    interest_rate = 0.2 if (period == "1_month" and amount <= 50000) else 0.1

    try:
        approved_date = datetime.fromisoformat(approved_at.replace('Z', '+00:00'))
    except ValueError:
        return quick_loan

    last_accrual_at = quick_loan.get("last_interest_accrual_at")
    if last_accrual_at:
        try:
            last_accrual_date = datetime.fromisoformat(last_accrual_at.replace('Z', '+00:00'))
        except ValueError:
            last_accrual_date = approved_date
    else:
        last_accrual_date = approved_date

    now = datetime.now(timezone.utc)
    if now <= last_accrual_date:
        return quick_loan

    elapsed_days = (now - last_accrual_date).days

    if period == "2_weeks":
        period_days = 14
    else:
        period_days = 30

    periods_elapsed = max(0, elapsed_days // period_days)
    if periods_elapsed <= 0:
        return quick_loan

    current_interest = quick_loan.get("current_interest", quick_loan.get("interest_amount", 0))
    additional_interest = round(amount * interest_rate * periods_elapsed, 2)
    total_interest = round(current_interest + additional_interest, 2)
    total_due = round(amount + total_interest, 2)
    outstanding_balance = max(0, total_due - quick_loan.get("amount_repaid", 0))

    update_fields = {
        "current_interest": total_interest,
        "total_due": total_due,
        "outstanding_balance": outstanding_balance,
        "last_interest_accrual_at": now.isoformat(),
    }

    if outstanding_balance <= 0 and not quick_loan.get("repaid"):
        update_fields["repaid"] = True
        update_fields["repaid_at"] = now.isoformat()
        update_fields["status"] = "repaid"

    quick_loan.update(update_fields)

    loan_id = quick_loan.get("_id")
    if loan_id:
        await db.quick_loans.update_one({"_id": loan_id}, {"$set": update_fields})

    return quick_loan

@api_router.get("/quick-loans/valid-codes")
async def get_quick_loan_valid_codes(user: dict = Depends(get_current_user_optional)):
    member_cursor = db.users.find({"member_code": {"$exists": True, "$ne": None}}, {"member_code": 1, "name": 1})
    members = await member_cursor.to_list(10000)
    member_codes = []
    for m in members:
        code = m.get("member_code")
        if code:
            member_codes.append({
                "code": code,
                "label": f"{m.get('name', 'Member')} ({code})",
                "type": "member",
            })

    officer_codes = [
        {"code": o["code"], "label": f"Officer - {o['name']} ({o['code']})", "type": "officer"}
        for o in OFFICERS
    ]

    return {
        "officers": officer_codes,
        "members": member_codes,
        "all": officer_codes + member_codes,
    }

@api_router.post("/quick-loans/request")
async def request_quick_loan(
    request: Request,
    loan_name: str = Form(...),
    loan_email: Optional[str] = Form(None),
    loan_phone: Optional[str] = Form(None),
    amount: float = Form(...),
    purpose: Optional[str] = Form(None),
    collateral: Optional[str] = Form(None),
    is_guaranteed: bool = Form(...),
    officer_code: Optional[str] = Form(None),
    officer_name: Optional[str] = Form(None),
    serial_number: Optional[str] = Form(None),
    collateral_image: Optional[UploadFile] = File(None),
    user: Optional[dict] = Depends(get_current_user_optional),
    buyer_name: Optional[str] = Form(None),
    repayment_period: Optional[str] = Form(None),
    currency: Optional[str] = Form(None),
    borrower_address: Optional[str] = Form(None),
    borrower_city: Optional[str] = Form(None),
    security_description: Optional[str] = Form(None),
    guarantor_name: Optional[str] = Form(None),
    guarantor_address: Optional[str] = Form(None),
    jurisdiction: Optional[str] = Form(None),
    witness_name: Optional[str] = Form(None),
    agreement_interest_rate: Optional[float] = Form(None),
):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Quick loan amount must be positive")

    if is_guaranteed and not officer_code:
        raise HTTPException(status_code=400, detail="Please select a loans officer or member code for a guaranteed quick loan")

    if not is_guaranteed and not collateral:
        raise HTTPException(status_code=400, detail="Please provide collateral details for a collateral-backed quick loan")

    if is_guaranteed and officer_code:
        code = officer_code.strip()
        officer_match = next((o for o in OFFICERS if o["code"] == code), None)
        member_match = await db.users.find_one({"member_code": code})
        if not officer_match and not member_match:
            raise HTTPException(status_code=400, detail="Invalid officer or member code. Please select a valid code from the list")

    collateral_image_url = None
    if collateral_image and collateral_image.filename:
        upload_result = await upload_to_cloudinary(collateral_image)
        collateral_image_url = upload_result.get("secure_url") or upload_result.get("url")

    national_id_images = []
    form_data = await request.form()
    for key in form_data:
        if key == "national_id_images":
            files = form_data.getlist(key)
            for file in files:
                if file and file.filename:
                    result = await upload_to_cloudinary(file)
                    national_id_images.append(result.get("secure_url") or result.get("url"))

    loan_doc = {
        "user_id": user["id"] if user else None,
        "user_name": user["name"] if user else loan_name,
        "user_email": user.get("email") if user else (loan_email.strip() if loan_email else None),
        "loan_name": loan_name,
        "loan_email": loan_email.strip() if loan_email else None,
        "loan_phone": loan_phone.strip() if loan_phone else None,
        "amount": amount,
        "purpose": purpose.strip() if purpose else None,
        "collateral": collateral.strip() if collateral else None,
        "is_guaranteed": is_guaranteed,
        "officer_code": officer_code.strip() if officer_code else None,
        "officer_name": officer_name.strip() if officer_name else None,
        "serial_number": serial_number.strip() if serial_number else None,
        "buyer_name": buyer_name.strip() if buyer_name else None,
        "collateral_image": collateral_image_url,
        "national_id_images": national_id_images,
        "currency": currency.strip() if currency else "UGX",
        "borrower_address": borrower_address.strip() if borrower_address else None,
        "borrower_city": borrower_city.strip() if borrower_city else None,
        "security_description": security_description.strip() if security_description else None,
        "guarantor_name": guarantor_name.strip() if guarantor_name else None,
        "guarantor_address": guarantor_address.strip() if guarantor_address else None,
        "jurisdiction": jurisdiction.strip() if jurisdiction else "Uganda",
        "witness_name": witness_name.strip() if witness_name else None,
        "agreement_interest_rate": float(agreement_interest_rate) if agreement_interest_rate is not None else (0.2 if (repayment_period == "1_month" and amount <= 50000) else 0.1),
        "interest_rate": 0.2 if (repayment_period == "1_month" and amount <= 50000) else 0.1,
        "interest_period": repayment_period or "2_weeks",
        "interest_amount": round(amount * (0.2 if (repayment_period == "1_month" and amount <= 50000) else 0.1), 2),
        "total_due": round(amount * (1 + (0.2 if (repayment_period == "1_month" and amount <= 50000) else 0.1)), 2),
        "status": "pending_treasurer",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "approved_by": None,
        "notes": None,
    }

    result = await db.quick_loans.insert_one(loan_doc)
    loan_doc["id"] = str(result.inserted_id)
    loan_doc.pop("_id", None)
    return loan_doc

@api_router.get("/quick-loans")
async def get_quick_loans(user: dict = Depends(require_treasurer)):
    quick_loans = await db.quick_loans.find({}).to_list(1000)
    result = []
    for q in quick_loans:
        q["id"] = str(q["_id"])
        await accrue_quick_loan_interest(q)
        q.pop("_id", None)
        result.append(q)
    return result

@api_router.get("/quick-loans/my")
async def get_my_quick_loans(user: dict = Depends(get_current_user)):
    member_code = user.get("member_code")
    user_id = user.get("id")
    user_name = user.get("name")
    query = {
        "$or": [
            {"officer_code": member_code},
            {"user_id": user_id},
        ]
    }
    if user_name:
        query["$or"].append({"officer_name": user_name})
    quick_loans = await db.quick_loans.find(query).to_list(1000)
    result = []
    for q in quick_loans:
        q["id"] = str(q["_id"])
        await accrue_quick_loan_interest(q)
        q.pop("_id", None)
        result.append(q)
    return result

@api_router.post("/quick-loans/approve")
async def approve_quick_loan(approval: TransactionApproval, user: dict = Depends(require_treasurer)):
    quick_loan = await db.quick_loans.find_one({"_id": ObjectId(approval.transaction_id)})
    if not quick_loan:
        raise HTTPException(status_code=404, detail="Quick loan request not found")

    if quick_loan.get("status") != "pending_treasurer":
        raise HTTPException(status_code=400, detail="Quick loan request has already been processed")

    new_status = "approved" if approval.approved else "rejected"
    await db.quick_loans.update_one(
        {"_id": ObjectId(approval.transaction_id)},
        {"$set": {
            "status": new_status,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": user["id"],
            "notes": approval.notes,
        }}
    )
    return {"message": f"Quick loan request {new_status}"}

@api_router.delete("/quick-loans/{loan_id}")
async def delete_quick_loan(loan_id: str, user: dict = Depends(require_treasurer)):
    try:
        loid = ObjectId(loan_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid loan id")

    result = await db.quick_loans.delete_one({"_id": loid})
    if result.deleted_count == 0:
        fallback = await db.quick_loans.find_one({"id": loan_id})
        if fallback:
            await db.quick_loans.delete_one({"_id": fallback["_id"]})
            return {"message": "Quick loan request deleted"}
        raise HTTPException(status_code=404, detail="Quick loan request not found")

    return {"message": "Quick loan request deleted"}

@api_router.post("/quick-loans/batch-delete")
async def batch_delete_quick_loans(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for loan_id in data.order_ids:
        try:
            loid = ObjectId(loan_id)
        except Exception:
            errors.append({"id": loan_id, "error": "Invalid loan id"})
            continue
        result = await db.quick_loans.delete_one({"_id": loid})
        if result.deleted_count > 0:
            deleted_ids.append(loan_id)
        else:
            fallback = await db.quick_loans.find_one({"id": loan_id})
            if fallback:
                await db.quick_loans.delete_one({"_id": fallback["_id"]})
                deleted_ids.append(loan_id)
            else:
                errors.append({"id": loan_id, "error": "Quick loan not found"})
    return {"deleted": deleted_ids, "errors": errors}

@api_router.post("/loans/batch-delete")
async def batch_delete_loans(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for loan_id in data.order_ids:
        try:
            oid = ObjectId(loan_id)
        except Exception:
            errors.append({"id": loan_id, "error": "Invalid loan id"})
            continue
        loan = await db.loans.find_one({"_id": oid})
        if not loan:
            fallback = await db.loans.find_one({"id": loan_id})
            if fallback:
                oid = fallback["_id"]
                loan = fallback
            else:
                errors.append({"id": loan_id, "error": "Loan not found"})
                continue
        # If approved and guarantor counter was incremented, decrement back
        if loan.get("status") == "approved" and not loan.get("repaid") and loan.get("guarantor_id"):
            await db.users.update_one(
                {"_id": ObjectId(loan["guarantor_id"])},
                {"$inc": {"guarantees_given": -1}}
            )
        result = await db.loans.delete_one({"_id": oid})
        if result.deleted_count > 0:
            deleted_ids.append(loan_id)
        else:
            errors.append({"id": loan_id, "error": "Delete failed"})
    return {"deleted": deleted_ids, "errors": errors}

@api_router.post("/withdrawals/batch-delete")
async def batch_delete_withdrawals(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for withdrawal_id in data.order_ids:
        try:
            oid = ObjectId(withdrawal_id)
        except Exception:
            errors.append({"id": withdrawal_id, "error": "Invalid withdrawal id"})
            continue
        withdrawal = await db.withdrawals.find_one({"_id": oid})
        if not withdrawal:
            errors.append({"id": withdrawal_id, "error": "Withdrawal not found"})
            continue
        # If approved, reverse balance changes
        if withdrawal.get("status") == "approved":
            if withdrawal.get("withdrawal_type") != "leaving_group":
                await db.users.update_one(
                    {"_id": ObjectId(withdrawal["user_id"])},
                    {"$inc": {"total_savings": withdrawal["amount"]}}
                )
        result = await db.withdrawals.delete_one({"_id": oid})
        if result.deleted_count > 0:
            deleted_ids.append(withdrawal_id)
        else:
            errors.append({"id": withdrawal_id, "error": "Delete failed"})
    return {"deleted": deleted_ids, "errors": errors}

@api_router.post("/petty-cash/batch-delete")
async def batch_delete_petty_cash(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for entry_id in data.order_ids:
        try:
            oid = ObjectId(entry_id)
        except Exception:
            errors.append({"id": entry_id, "error": "Invalid petty cash id"})
            continue
        entry = await db.petty_cash.find_one({"_id": oid})
        if not entry:
            errors.append({"id": entry_id, "error": "Petty cash entry not found"})
            continue
        # Reverse the balance change
        await db.users.update_one(
            {"_id": ObjectId(entry["user_id"])},
            {"$inc": {"total_savings": entry.get("amount", 0)}}
        )
        result = await db.petty_cash.delete_one({"_id": oid})
        if result.deleted_count > 0:
            deleted_ids.append(entry_id)
        else:
            errors.append({"id": entry_id, "error": "Delete failed"})
    return {"deleted": deleted_ids, "errors": errors}

@api_router.post("/quick-loans/{loan_id}/repay")
async def repay_quick_loan(loan_id: str, amount: float = Body(..., embed=True), user: dict = Depends(get_current_user)):
    try:
        loid = ObjectId(loan_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid loan id")

    quick_loan = await db.quick_loans.find_one({"_id": loid})
    if not quick_loan:
        fallback = await db.quick_loans.find_one({"id": loan_id})
        if not fallback:
            raise HTTPException(status_code=404, detail="Quick loan not found")
        quick_loan = fallback

    if quick_loan.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Quick loan is not approved")

    if quick_loan.get("repaid"):
        raise HTTPException(status_code=400, detail="Quick loan already repaid")

    quick_loan = await accrue_quick_loan_interest(quick_loan)
    outstanding = quick_loan.get("outstanding_balance", quick_loan.get("total_due", quick_loan.get("amount", 0)))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")

    payment_to_apply = min(amount, outstanding)
    new_balance = max(0, outstanding - payment_to_apply)

    update_data = {
        "$set": {
            "outstanding_balance": new_balance,
            "repaid": new_balance <= 0,
            "repaid_at": datetime.now(timezone.utc).isoformat() if new_balance <= 0 else None,
            "status": "repaid" if new_balance <= 0 else "approved",
        },
        "$inc": {"amount_repaid": payment_to_apply}
    }

    await db.quick_loans.update_one({"_id": loid}, update_data)
    return {"message": "Payment recorded", "outstanding_balance": new_balance, "repaid": new_balance <= 0}

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
    if user.get("role") in ["admin", "super_admin", "treasurer"]:
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
    for loan_item in loans:
        loan_item["id"] = str(loan_item["_id"])
        loan_item.pop("_id", None)
        
        # For pending loans, surface initial interest/total if not present (backward-compat)
        if loan_item.get("status") in ["pending_guarantor", "pending_admin"]:
            if not loan_item.get("initial_interest"):
                loan_item["initial_interest"] = loan_item["amount"] * LOAN_INTEREST_NORMAL
                loan_item["initial_total_due"] = loan_item["amount"] + loan_item["initial_interest"]
            loan_item["current_interest"] = loan_item.get("initial_interest")
            loan_item["total_due"] = loan_item.get("initial_total_due")
        
        # Calculate current interest for approved loans
        if loan_item.get("status") == "approved" and not loan_item.get("repaid"):
            try:
                loan_item = await accrue_loan_interest_on_db(loan_item)
                loan_item["total_due"] = get_loan_outstanding_balance(loan_item)
                loan_item["months_elapsed"] = get_loan_months_elapsed(loan_item)
            except Exception as e:
                logger.error("Failed to process loan %s during list retrieval: %s", loan_item.get("id"), e)
        
        result.append(loan_item)

    if user.get("role") in ["admin", "super_admin", "treasurer"]:
        quick_loans = await db.quick_loans.find({"status": {"$in": ["approved", "pending_treasurer"]}}).to_list(1000)
        for ql in quick_loans:
            ql["id"] = f"quick_{str(ql['_id'])}"
            await accrue_quick_loan_interest(ql)
            ql.pop("_id", None)
            ql["is_quick_loan"] = True
            ql["guarantor_name"] = ql.get("officer_name") or ql.get("officer_code") or "N/A"
            if not ql.get("months_elapsed") and ql.get("approved_at"):
                try:
                    parsed_date = datetime.fromisoformat(ql["approved_at"].replace('Z', '+00:00'))
                    ql["months_elapsed"] = calculate_months_elapsed(parsed_date)
                except ValueError:
                    pass
            result.append(ql)

    return result

@api_router.post("/loans/approve")
async def approve_loan(approval: TransactionApproval, user: dict = Depends(require_admin)):
    loan = await db.loans.find_one({"_id": ObjectId(approval.transaction_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    # Admin can approve loans in pending_guarantor or pending_admin status
    if loan["status"] not in ["pending_guarantor", "pending_admin"]:
        raise HTTPException(status_code=400, detail="Loan already processed")
    
    # If admin rejects a pending_guarantor loan, mark as rejected_by_guarantor
    if loan["status"] == "pending_guarantor" and not approval.approved:
        await db.loans.update_one(
            {"_id": ObjectId(approval.transaction_id)},
            {"$set": {
                "guarantor_approved": False,
                "guarantor_approved_at": datetime.now(timezone.utc).isoformat(),
                "guarantor_notes": "Rejected by admin",
                "status": "rejected_by_guarantor"
            }}
        )
        return {"message": "Loan rejected"}
    
    # If loan is in pending_guarantor and admin approves, approve on behalf of guarantor first
    if loan["status"] == "pending_guarantor":
        await db.loans.update_one(
            {"_id": ObjectId(approval.transaction_id)},
            {"$set": {
                "guarantor_approved": True,
                "guarantor_approved_at": datetime.now(timezone.utc).isoformat(),
                "guarantor_notes": "Approved by admin",
                "status": "pending_admin"
            }}
        )
        loan = await db.loans.find_one({"_id": ObjectId(approval.transaction_id)})
    
    # Now process admin approval
    new_status = "approved" if approval.approved else "rejected"
    update_data = {
        "status": new_status,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": user["id"],
        "notes": approval.notes
    }
    
    if approval.approved:
        due_date = datetime.now(timezone.utc) + timedelta(days=120)
        update_data["due_date"] = due_date.isoformat()
        update_data["last_interest_accrual_at"] = datetime.now(timezone.utc).isoformat()
        update_data["outstanding_balance"] = loan["amount"] * (1 + LOAN_INTEREST_NORMAL)
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
    
    loan = await accrue_loan_interest_on_db(loan)
    outstanding_balance = get_loan_outstanding_balance(loan)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")

    payment_to_apply = min(amount, outstanding_balance)
    new_balance = max(0, outstanding_balance - payment_to_apply)

    update_data = {
        "$set": {
            "outstanding_balance": new_balance,
            "repaid": new_balance <= 0,
            "repaid_at": datetime.now(timezone.utc).isoformat() if new_balance <= 0 else None,
            "status": "repaid" if new_balance <= 0 else "approved"
        },
        "$inc": {"amount_repaid": payment_to_apply}
    }

    await db.loans.update_one({"_id": ObjectId(loan_id)}, update_data)
    
    # Decrement guarantor's guarantee count if fully repaid
    if new_balance <= 0:
        await db.users.update_one(
            {"_id": ObjectId(loan["guarantor_id"])},
            {"$inc": {"guarantees_given": -1}}
        )

    return {
        "message": "Payment recorded",
        "amount_paid": payment_to_apply,
        "total_repaid": loan.get("amount_repaid", 0) + payment_to_apply,
        "total_due": new_balance,
        "fully_repaid": new_balance <= 0
    }

# ==================== WITHDRAWAL ENDPOINTS ====================

@api_router.delete("/loans/{loan_id}")
async def delete_loan(loan_id: str, user: dict = Depends(get_current_user)):
    """Delete a loan. Members can delete own pending/rejected; Treasurer can delete any (including approved/repaid)."""
    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    is_treasurer = user.get("role") in ["super_admin", "treasurer"]
    is_owner = loan.get("user_id") == user["id"]
    
    if not is_treasurer:
        if not is_owner:
            raise HTTPException(status_code=403, detail="You can only delete your own records")
        if loan.get("status") in ["approved", "pending_admin"]:
            raise HTTPException(status_code=403, detail="Approved/admin-pending loans can only be deleted by Treasurer")
    
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
    if user.get("role") in ["admin", "super_admin", "treasurer"]:
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
    """Delete a withdrawal. Members can delete own pending/rejected; Treasurer can delete any."""
    withdrawal = await db.withdrawals.find_one({"_id": ObjectId(withdrawal_id)})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    is_treasurer = user.get("role") in ["super_admin", "treasurer"]
    is_owner = withdrawal.get("user_id") == user["id"]
    
    if not is_treasurer:
        if not is_owner:
            raise HTTPException(status_code=403, detail="You can only delete your own records")
        if withdrawal.get("status") == "approved":
            raise HTTPException(status_code=403, detail="Approved withdrawals can only be deleted by Treasurer")
    
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
    # Only count late fees that were actually applied (deducted) on approved deposits
    pipeline = [
        {"$match": {"status": "approved", "late_fee": {"$gt": 0}, "late_fee_applied": True}},
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

async def get_total_group_slots() -> int:
    """Count the total number of slots held by members in the group."""
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total_slots": {"$sum": "$max_guarantees"}}}
    ]
    result = await db.users.aggregate(pipeline).to_list(1)
    return int(result[0]["total_slots"]) if result else 0

async def get_total_distributed_interest_shares() -> float:
    setting = await db.settings.find_one({"key": "interest_share_distributed_total"})
    if setting and isinstance(setting.get("value"), (int, float)):
        return float(setting["value"])
    return 0.0

async def calculate_pending_interest_share_pool() -> float:
    """Calculate interest share pool pending distribution."""
    total_interest = await calculate_total_interest_earned()
    total_late_fees = await calculate_total_late_fees()
    total_petty_cash = await get_total_petty_cash_used()
    distributed_amount = await get_total_distributed_interest_shares()
    current_pool = total_interest + total_late_fees - total_petty_cash
    pending_amount = max(0.0, current_pool - distributed_amount)
    return float(round(pending_amount, 2))

async def record_interest_share_distribution(amount: float) -> None:
    await db.settings.update_one(
        {"key": "interest_share_distributed_total"},
        {"$inc": {"value": amount}},
        upsert=True
    )

async def distribute_interest_shares_internal() -> dict:
    pending_amount = await calculate_pending_interest_share_pool()
    if pending_amount <= 0:
        return {
            "message": "No distributable interest available",
            "distributed_amount": 0,
            "pending_amount": 0,
            "total_slots": await get_total_group_slots(),
        }

    total_slots = await get_total_group_slots()
    if total_slots <= 0:
        return {
            "message": "No group slots available for distribution",
            "distributed_amount": 0,
            "pending_amount": pending_amount,
            "total_slots": 0,
        }

    per_slot_share = pending_amount / total_slots
    members = await db.users.find({"role": {"$nin": ["super_admin", "treasurer"]}}).to_list(1000)
    total_distributed = 0

    for member in members:
        num_slots = member.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
        share = int(round(per_slot_share * num_slots))
        if share <= 0:
            continue
        await db.users.update_one(
            {"_id": member["_id"]},
            {"$inc": {"total_savings": share}}
        )
        total_distributed += share

    if total_distributed > 0:
        await record_interest_share_distribution(total_distributed)

    return {
        "message": "Interest shared to members",
        "distributed_amount": total_distributed,
        "per_slot_share": float(round(per_slot_share, 2)),
        "total_slots": total_slots,
    }

@api_router.post("/stats/distribute-interest")
async def distribute_interest_shares(user: dict = Depends(require_admin)):
    return await distribute_interest_shares_internal()

@api_router.get("/stats/group")
async def get_group_stats(user: dict = Depends(get_current_user)):
    await distribute_interest_shares_internal()

    total_members = await db.users.count_documents({"role": {"$nin": ["super_admin", "treasurer"]}})
    premium_members = await db.users.count_documents({"membership_type": "premium", "role": {"$nin": ["super_admin", "treasurer"]}})
    
    # Total savings from all members
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_savings"}}}
    ]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_savings = result[0]["total"] if result else 0
    
    # Total development fund from all members
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$development_fund"}}}
    ]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_development = result[0]["total"] if result else 0
    
    # Total interest earned
    total_interest = await calculate_total_interest_earned()
    
    # Total late fees
    total_late_fees = await calculate_total_late_fees()
    
    # Total petty cash used
    total_petty_cash = await get_total_petty_cash_used()

    # Pending interest share pool available for distribution
    pending_interest_share = await calculate_pending_interest_share_pool()
    total_slots = await get_total_group_slots()
    per_slot_interest_share = float(round(pending_interest_share / total_slots, 2)) if total_slots > 0 else 0.0
    
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
        "pending_interest_share": pending_interest_share,
        "total_slots": total_slots,
        "per_slot_interest_share": per_slot_interest_share,
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
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_savings"}}}
    ]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_savings = result[0]["total"] if result else 0
    
    # Total development fund
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$development_fund"}}}
    ]
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
    """Delete a petty cash entry (Admin or Treasurer)"""
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
            f"Max loan: UGX {MAX_LOAN_AMOUNT:,} per slot (up to {MAX_GUARANTEES_PER_MEMBER} slots = UGX {MAX_LOAN_AMOUNT * MAX_GUARANTEES_PER_MEMBER:,})",
            "Loan interest: 3% per month (within 4 months), 5% beyond",
            "Each loan requires a guarantor (max 2 guarantees per member)",
            "2 months notice required to leave group",
            f"Year-end sharing: {YEAR_END_DATE}"
        ]
    }

# ==================== TREASURER SEED ====================

async def seed_treasurer():
    admin_email = os.environ.get("SUPER_ADMIN_EMAIL", "treasurer@savingsgroup.com")
    admin_password = os.environ.get("SUPER_ADMIN_PASSWORD", "Treasurer@123")
    admin_phone = os.environ.get("SUPER_ADMIN_PHONE", "0700000000")
    admin_name = os.environ.get("SUPER_ADMIN_NAME", "Treasurer")
    admin_role = os.environ.get("SUPER_ADMIN_ROLE", "super_admin")
    if admin_role not in ["super_admin", "treasurer"]:
        admin_role = "super_admin"

    normalized_admin_phone = normalize_phone(admin_phone)

    existing = await db.users.find_one({
        "$or": [
            {"email": admin_email},
            {"phone": admin_phone},
            {"normalized_phone": normalized_admin_phone}
        ]
    })

    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": admin_name,
            "phone": admin_phone,
            "normalized_phone": normalized_admin_phone,
            "role": admin_role,
            "membership_type": "premium",
            "total_savings": 0,
            "development_fund": 0,
            "total_late_fees": 0,
            "guarantees_given": 0,
            "leaving_requested": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"{admin_role.replace('_', ' ').title()} created: {admin_email} / {admin_phone}")
    else:
        update_fields = {
            "email": admin_email,
            "phone": admin_phone,
            "normalized_phone": normalized_admin_phone,
            "role": admin_role,
            "membership_type": "premium",
            "password_hash": hash_password(admin_password),
        }
        await db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": update_fields}
        )
        logger.info(f"{admin_role.replace('_', ' ').title()} account normalized: {admin_email} / {admin_phone}")

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
        await migrate_normalized_phone()
        duplicates = await get_duplicate_normalized_phones()
        if duplicates:
            logger.error(
                "Found duplicate normalized_phone values while creating unique index, please clean the following duplicates first: %s",
                [{"normalized_phone": dup["_id"], "count": dup["count"], "ids": [str(i) for i in dup["ids"]]} for dup in duplicates]
            )
        else:
            await db.users.create_index("normalized_phone", unique=True, sparse=True)
        await db.deposits.create_index("user_id")
        await db.loans.create_index("user_id")
        await db.loans.create_index("guarantor_id")
        await db.withdrawals.create_index("user_id")
        await db.leaving_requests.create_index("user_id")
        await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
        
        # Migration: Add max_guarantees field to existing users
        await db.users.update_many(
            {"max_guarantees": {"$exists": False}},
            {"$set": {"max_guarantees": 2}}
        )
        logger.info("Migration completed: Added max_guarantees field to existing users")
        
        await seed_treasurer()
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
    
    logger.info("Application started successfully")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    origin = request.headers.get("origin", "")
    allow_origin = origin if origin in [
        "http://localhost:3000",
        "https://c1group.site",
        "https://cash-hub.onrender.com",
        "https://cash-hub-api.onrender.com",
    ] else "*"
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={
            "Access-Control-Allow-Origin": allow_origin,
            "Access-Control-Allow-Credentials": "true" if allow_origin != "*" else "false",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
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

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

    @app.get("/product/{product_id}")
    async def serve_product_preview(product_id: str, request: Request):
        from bson import ObjectId
        from urllib.parse import quote

        if request.query_params.get("preview") == "1":
            index_path = static_dir / "index.html"
            if index_path.exists():
                return FileResponse(str(index_path))
            raise HTTPException(status_code=404, detail="Not found")

        product = None
        if ObjectId.is_valid(product_id):
            product = await db.products.find_one({"_id": ObjectId(product_id)})

        if product:
            product["id"] = str(product["_id"])
            product.pop("_id", None)

        base_url = str(request.base_url).rstrip("/")
        product_url = f"{base_url}/product/{product_id}?preview=1"
        title = product.get("title", "Class One Savings Group") if product else "Class One Savings Group"
        description = (product.get("description") or f"Discover {title} on Class One Savings Group.").strip()
        image_url = product.get("image_url") or (product.get("image_urls") or [None])[0] if product else None
        if image_url and not str(image_url).startswith(("http://", "https://", "data:")):
            image_url = f"{base_url}/{image_url.lstrip('/')}"
        elif not image_url:
            image_url = f"{base_url}/classOne-logo.png"

        escaped_title = title.replace("&", "&amp;").replace("\"", "&quot;")
        escaped_description = description.replace("&", "&amp;").replace("\"", "&quot;")
        escaped_image_url = str(image_url).replace("&", "&amp;")
        escaped_product_url = product_url.replace("&", "&amp;")

        html = f"""<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>{escaped_title} | Class One Savings Group</title>
    <meta name=\"description\" content=\"{escaped_description}\" />
    <meta property=\"og:title\" content=\"{escaped_title} | Class One Savings Group\" />
    <meta property=\"og:description\" content=\"{escaped_description}\" />
    <meta property=\"og:type\" content=\"product\" />
    <meta property=\"og:url\" content=\"{escaped_product_url}\" />
    <meta property=\"og:image\" content=\"{escaped_image_url}\" />
    <meta property=\"og:image:secure_url\" content=\"{escaped_image_url}\" />
    <meta property=\"og:image:alt\" content=\"{escaped_title} on Class One Savings Group\" />
    <meta name=\"twitter:card\" content=\"summary_large_image\" />
    <meta name=\"twitter:title\" content=\"{escaped_title} | Class One Savings Group\" />
    <meta name=\"twitter:description\" content=\"{escaped_description}\" />
    <meta name=\"twitter:image\" content=\"{escaped_image_url}\" />
    <meta name=\"twitter:image:alt\" content=\"{escaped_title} on Class One Savings Group\" />
    <meta http-equiv=\"refresh\" content=\"0;url={escaped_product_url}\" />
    <script>window.location.replace('{escaped_product_url}');</script>
  </head>
  <body>
    <p>Redirecting to the product page…</p>
  </body>
</html>"""
        return HTMLResponse(content=html)
    
    @app.head("/{full_path:path}")
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

# ==================== WEBSOCKET ENDPOINT ====================

@app.websocket("/ws/orders/{seller_name}")
async def websocket_endpoint(websocket: WebSocket, seller_name: str):
    await manager.connect(websocket, seller_name)
    try:
        while True:
            data = await websocket.receive_text()
    except Exception:
        manager.disconnect(websocket, seller_name)
