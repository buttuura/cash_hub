"""Domain routes loaded into the shared API router."""

try:
    from .. import app_shared as _shared
    from ..app_shared import *
except ImportError:
    import app_shared as _shared
    from app_shared import *

for _name in dir(_shared):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_shared, _name)


@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    phone = user_data.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    
    email = user_data.email if user_data.email else None
    normalized_email = email.lower() if email else None
    next_of_kin_name = user_data.next_of_kin_name.strip() if user_data.next_of_kin_name else None
    next_of_kin_phone = user_data.next_of_kin_phone.strip() if user_data.next_of_kin_phone else None
    national_id = user_data.national_id.strip() if user_data.national_id else None

    if not next_of_kin_name:
        raise HTTPException(status_code=400, detail="Next of kin name is required")
    if not next_of_kin_phone:
        raise HTTPException(status_code=400, detail="Next of kin phone number is required")
    if national_id and len(national_id) != 14:
        raise HTTPException(status_code=400, detail="National ID must be exactly 14 characters")
    
    # Check phone uniqueness
    existing_phone = await db.users.find_one({"normalized_phone": normalized_phone})
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Check email uniqueness (if provided)
    if normalized_email:
        existing_email = await db.users.find_one({
            "$or": [
                {"normalized_email": normalized_email},
                {"email": normalized_email},
            ]
        })
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    requested_membership = (user_data.membership_type or "seller").strip().lower()
    if requested_membership not in ["seller", "ordinary", "premium"]:
        requested_membership = "seller"

    user_doc = {
        "phone": phone,
        "normalized_phone": normalized_phone,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": "seller",
        "membership_type": requested_membership,
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
        user_doc["normalized_email"] = normalized_email
    user_doc["next_of_kin_name"] = next_of_kin_name
    user_doc["next_of_kin_phone"] = next_of_kin_phone
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
        "next_of_kin_phone": next_of_kin_phone,
        "national_id": national_id,
        "role": "seller",
        "membership_type": requested_membership,
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
        normalized_email = identifier.lower()
        user = await db.users.find_one({"normalized_email": normalized_email})
        if not user:
            user = await db.users.find_one({"email": normalized_email})
    
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


@api_router.post("/auth/profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Profile picture must be a JPEG, PNG, or WebP image")

    upload_result = await upload_to_cloudinary(file, folder="cash_hub/profile-pictures")
    image_url = upload_result.get("secure_url") or upload_result.get("url")
    if not image_url:
        raise HTTPException(status_code=500, detail="Profile picture upload returned no URL")

    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"profile_picture_url": image_url}},
    )
    return {"profile_picture_url": image_url}


@api_router.post("/auth/logout")
async def logout():
    return {"message": "Logged out successfully"}


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

