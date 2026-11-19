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


@api_router.post("/loans/request")
async def request_loan(loan: LoanRequest, user: dict = Depends(get_current_user)):
    if user.get("membership_type") != "premium":
        raise HTTPException(status_code=403, detail="Only premium members can request loans")
    
    if loan.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    user_max_guarantees = user.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
    user_max_loan = MAX_LOAN_AMOUNT * user_max_guarantees
    active_loans = await db.loans.find({
        "user_id": user["id"],
        "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
        "repaid": False
    }).to_list(1000)
    active_loan_amount = sum(float(active_loan.get("amount", 0) or 0) for active_loan in active_loans)
    remaining_loan_limit = max(0, user_max_loan - active_loan_amount)
    if loan.amount > remaining_loan_limit:
        raise HTTPException(
            status_code=400,
            detail=f"You can request up to UGX {remaining_loan_limit:,.0f} more. Your total loan limit is UGX {user_max_loan:,}."
        )
    
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

    await send_push_to_roles(["treasurer"], {
        "id": f"loan-{loan_doc['id']}",
        "type": "new_loan",
        "pending_transaction_id": loan_doc["id"],
        "pending_transaction_collection": "loans",
        "pending_statuses": ["pending_guarantor", "pending_admin"],
        "title": "Loan request",
        "body": f"{loan_doc.get('user_name') or 'A member'} applied for UGX {float(loan_doc.get('amount') or 0):,.0f}",
        "url": "/dashboard",
    })
    await send_push_to_users([loan_doc["user_id"]], {
        "id": f"loan-request-{loan_doc['id']}",
        "type": "transaction_update",
        "title": "Loan request submitted",
        "body": f"Your UGX {float(loan_doc.get('amount') or 0):,.0f} loan request is awaiting review.",
        "url": "/dashboard",
    })
    await send_push_to_users([loan_doc["guarantor_id"]], {
        "id": f"loan-guarantor-{loan_doc['id']}",
        "type": "transaction_update",
        "title": "Loan guarantee requested",
        "body": f"{loan_doc.get('user_name') or 'A member'} requested your guarantee for UGX {float(loan_doc.get('amount') or 0):,.0f}.",
        "url": "/dashboard",
    })

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
    await send_push_to_users([data.member_id], {
        "id": f"loan-admin-created-{loan_doc['id']}",
        "type": "transaction_update",
        "title": "Loan issued",
        "body": f"A UGX {float(loan_doc.get('amount') or 0):,.0f} loan was added to your account.",
        "url": "/dashboard",
    })
    return loan_doc


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
    collateral_image: Optional[UploadFile] = File(None),
    collateral_images: Optional[List[UploadFile]] = File(None),
    user: Optional[dict] = Depends(get_current_user_optional),
    buyer_name: Optional[str] = Form(None),
    seller_name: Optional[str] = Form(None),
    repayment_period: Optional[str] = Form(None),
    currency: Optional[str] = Form(None),
    borrower_address: Optional[str] = Form(None),
    borrower_city: Optional[str] = Form(None),
    security_description: Optional[str] = Form(None),
    guarantor_name: Optional[str] = Form(None),
    guarantor_address: Optional[str] = Form(None),
    jurisdiction: Optional[str] = Form(None),
    witness_name: Optional[str] = Form(None),
    nin_number: Optional[str] = Form(None),
    agreement_interest_rate: Optional[float] = Form(None),
    agreed_total_due: Optional[float] = Form(None),
    seller_phone: Optional[str] = Form(None),
    property_description: Optional[str] = Form(None),
    sale_date: Optional[str] = Form(None),
    agreed_price_words: Optional[str] = Form(None),
    payment_status: Optional[str] = Form(None),
    handover_status: Optional[str] = Form(None),
    witness_1_name: Optional[str] = Form(None),
    witness_2_name: Optional[str] = Form(None),
    members_confirmed: bool = Form(False),
):
    if not math.isfinite(amount) or amount <= 0:
        raise HTTPException(status_code=400, detail="Quick loan amount must be positive")

    if is_guaranteed and not officer_code:
        raise HTTPException(status_code=400, detail="Please select a loans officer or member code for a guaranteed quick loan")

    if not is_guaranteed and not collateral:
        raise HTTPException(status_code=400, detail="Please provide collateral details for a collateral-backed quick loan")
    selling_party_name = seller_name.strip() if seller_name and seller_name.strip() else (buyer_name.strip() if buyer_name and buyer_name.strip() else None)
    if not is_guaranteed and not selling_party_name:
        raise HTTPException(status_code=400, detail="Please enter the seller name")
    form_data = await request.form()
    national_id_uploads = [
        file for file in form_data.getlist("national_id_images")
        if file and file.filename
    ]
    if is_guaranteed and (nin_number or national_id_uploads):
        if not nin_number or len(nin_number.strip()) != 14:
            raise HTTPException(status_code=400, detail="National ID number must be exactly 14 characters")
        if len(national_id_uploads) < 2:
            raise HTTPException(status_code=400, detail="Please upload at least two National ID photos (front and back)")

    collateral_uploads = [image for image in (collateral_images or []) if image and image.filename]
    if collateral_image and collateral_image.filename:
        collateral_uploads.insert(0, collateral_image)
    if not is_guaranteed:
        if not collateral_uploads:
            raise HTTPException(status_code=400, detail="Please upload at least one security / pledged property photo")
        if not seller_phone or not seller_phone.strip() or not property_description or not property_description.strip():
            raise HTTPException(status_code=400, detail="Please complete the selling agreement details")
        if not sale_date:
            raise HTTPException(status_code=400, detail="Please provide the sale date")
        try:
            datetime.strptime(sale_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Enter a valid selling agreement date")
        if payment_status not in {"paid", "will_pay"}:
            raise HTTPException(status_code=400, detail="Choose a valid payment status")
        if handover_status not in {"handed_over", "will_hand_over"}:
            raise HTTPException(status_code=400, detail="Choose a valid property handover status")
        if not members_confirmed:
            raise HTTPException(status_code=400, detail="Confirm that the seller and buyer are group members")

    if is_guaranteed:
        if repayment_period and repayment_period not in {"2_weeks", "1_month"}:
            raise HTTPException(status_code=400, detail="Invalid repayment period for a guaranteed loan")

    if is_guaranteed and officer_code:
        code = officer_code.strip()
        officer_match = next((o for o in OFFICERS if o["code"] == code), None)
        member_match = await db.users.find_one({"member_code": code})
        if not officer_match and not member_match:
            raise HTTPException(status_code=400, detail="Invalid officer or member code. Please select a valid code from the list")

    collateral_image_urls = []
    for image in collateral_uploads:
        upload_result = await upload_to_cloudinary(image)
        image_url = upload_result.get("secure_url") or upload_result.get("url")
        if image_url:
            collateral_image_urls.append(image_url)
    if not is_guaranteed and not collateral_image_urls:
        raise HTTPException(status_code=502, detail="Could not upload the pledged property photos")

    national_id_images = []
    if is_guaranteed:
        for file in national_id_uploads:
            result = await upload_to_cloudinary(file)
            image_url = result.get("secure_url") or result.get("url")
            if image_url:
                national_id_images.append(image_url)
        if national_id_uploads and len(national_id_images) < 2:
            raise HTTPException(status_code=502, detail="Could not upload the National ID photos")

    if is_guaranteed:
        interest_rate = 0.2 if (repayment_period == "1_month" and amount <= 50000) else 0.1
        interest_amount = round(amount * interest_rate, 2)
        total_due = round(amount + interest_amount, 2)
        stored_agreement_interest_rate = (
            float(agreement_interest_rate) if agreement_interest_rate is not None
            else interest_rate * 100
        )
    else:
        interest_rate = 0
        interest_amount = 0
        total_due = round(amount, 2)
        stored_agreement_interest_rate = None

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
        "buyer_name": selling_party_name,
        "seller_name": selling_party_name,
        "agreement_buyer_name": loan_name.strip(),
        "agreed_price": amount if not is_guaranteed else None,
        "seller_phone": seller_phone.strip() if seller_phone else None,
        "property_description": property_description.strip() if property_description else None,
        "sale_date": sale_date,
        "agreed_price_words": ugx_amount_in_words(amount) if not is_guaranteed else None,
        "payment_status": payment_status,
        "handover_status": handover_status,
        "witness_1_name": (witness_1_name or "").strip() or None,
        "witness_2_name": (witness_2_name or "").strip() or None,
        "members_confirmed": members_confirmed,
        "collateral_image": collateral_image_urls[0] if collateral_image_urls else None,
        "collateral_images": collateral_image_urls,
        "national_id_images": national_id_images,
        "nin_number": nin_number.strip() if is_guaranteed and nin_number else None,
        "currency": currency.strip() if currency else "UGX",
        "borrower_address": borrower_address.strip() if borrower_address else None,
        "borrower_city": borrower_city.strip() if borrower_city else None,
        "security_description": security_description.strip() if security_description else None,
        "guarantor_name": guarantor_name.strip() if guarantor_name else None,
        "guarantor_address": guarantor_address.strip() if guarantor_address else None,
        "jurisdiction": jurisdiction.strip() if jurisdiction else "Uganda",
        "witness_name": witness_name.strip() if witness_name else None,
        "agreement_interest_rate": stored_agreement_interest_rate,
        "interest_rate": interest_rate,
        "interest_period": repayment_period if is_guaranteed else None,
        "repayment_period": repayment_period if is_guaranteed else None,
        "interest_amount": interest_amount,
        "total_due": total_due,
        "outstanding_balance": total_due,
        "manual_repayment_terms": not is_guaranteed,
        "amount_repaid": 0,
        "status": "pending_treasurer",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "approved_by": None,
        "notes": None,
    }

    result = await db.quick_loans.insert_one(loan_doc)
    loan_doc["id"] = str(result.inserted_id)
    loan_doc.pop("_id", None)
    await send_push_to_roles(["treasurer"], {
        "id": f"quick-loan-{loan_doc['id']}",
        "type": "new_loan",
        "pending_transaction_id": loan_doc["id"],
        "pending_transaction_collection": "quick_loans",
        "pending_statuses": ["pending_treasurer"],
        "title": "Quick loan request",
        "body": f"{loan_doc.get('user_name') or 'A member'} requested a quick loan of {loan_doc.get('currency') or 'UGX'} {float(loan_doc.get('amount') or 0):,.0f}.",
        "url": "/dashboard",
    })
    if loan_doc.get("user_id"):
        await send_push_to_users([loan_doc["user_id"]], {
            "id": f"quick-loan-request-{loan_doc['id']}",
            "type": "transaction_update",
            "title": "Quick loan request submitted",
            "body": f"Your quick loan request for {loan_doc.get('currency') or 'UGX'} {float(loan_doc.get('amount') or 0):,.0f} is awaiting review.",
            "url": "/dashboard",
        })
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
    quick_loan_ids = [str(quick_loan["_id"]) for quick_loan in quick_loans]
    pending_repayments = []
    if quick_loan_ids:
        pending_repayments = await db.deposits.find({
            "quick_loan_id": {"$in": quick_loan_ids},
            "deposit_type": "quick_loan_payment",
            "status": "pending",
        }).to_list(1000)
    pending_amounts = {}
    for repayment in pending_repayments:
        quick_loan_id = repayment.get("quick_loan_id")
        pending_amounts[quick_loan_id] = pending_amounts.get(quick_loan_id, 0) + float(repayment.get("amount") or 0)

    result = []
    for q in quick_loans:
        q["id"] = str(q["_id"])
        await accrue_quick_loan_interest(q)
        q["pending_repayment_amount"] = pending_amounts.get(q["id"], 0)
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
    await stop_pending_transaction_notification_repeats(approval.transaction_id)
    if quick_loan.get("user_id"):
        await send_push_to_users([quick_loan["user_id"]], {
            "id": f"quick-loan-status-{approval.transaction_id}",
            "type": "transaction_update",
            "title": f"Quick loan {new_status}",
            "body": f"Your quick loan request was {new_status}.",
            "url": "/dashboard",
        })
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

    is_borrower = quick_loan.get("user_id") == user.get("id")
    is_guarantor = (
        quick_loan.get("guarantor_id") == user.get("id")
        or (
            user.get("member_code")
            and quick_loan.get("officer_code") == user.get("member_code")
        )
    )
    if not is_borrower and not is_guarantor:
        raise HTTPException(status_code=403, detail="Only the borrower or guarantor can submit a quick loan repayment")

    if not math.isfinite(amount) or amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")

    quick_loan = await accrue_quick_loan_interest(quick_loan)
    outstanding = quick_loan.get("outstanding_balance", quick_loan.get("total_due", quick_loan.get("amount", 0)))
    outstanding = float(outstanding or 0)
    if outstanding <= 0:
        raise HTTPException(status_code=400, detail="Quick loan has no outstanding balance")

    pending_repayments = await db.deposits.find({
        "quick_loan_id": str(quick_loan.get("_id") or loan_id),
        "deposit_type": "quick_loan_payment",
        "status": "pending",
    }).to_list(1000)
    pending_amount = sum(float(repayment.get("amount") or 0) for repayment in pending_repayments)
    available_balance = max(0, outstanding - pending_amount)
    if amount > available_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Repayment exceeds the available balance of UGX {available_balance:,.0f} after pending repayments",
        )

    now = datetime.now(timezone.utc)
    deposit_doc = {
        "user_id": user["id"],
        "user_name": user.get("name", "Member"),
        "user_email": user.get("email"),
        "amount": amount,
        "deposit_type": "quick_loan_payment",
        "quick_loan_id": str(quick_loan.get("_id") or loan_id),
        "quick_loan_borrower_id": quick_loan.get("user_id"),
        "quick_loan_borrower_name": quick_loan.get("loan_name") or quick_loan.get("user_name"),
        "quick_loan_name": quick_loan.get("loan_name"),
        "description": f"Quick loan repayment for {quick_loan.get('loan_name') or quick_loan.get('user_name') or 'borrower'}",
        "status": "pending",
        "month": now.strftime("%Y-%m"),
        "created_at": now.isoformat(),
        "approved_at": None,
        "approved_by": None,
    }
    result = await db.deposits.insert_one(deposit_doc)
    deposit_doc["id"] = str(result.inserted_id)
    deposit_doc.pop("_id", None)

    await send_push_to_roles(["admin", "super_admin", "treasurer"], {
        "id": f"quick-loan-repayment-{deposit_doc['id']}",
        "type": "new_deposit",
        "deposit_id": deposit_doc["id"],
        "title": "Quick loan repayment awaiting approval",
        "body": (
            f"{user.get('name') or 'A member'} submitted UGX {amount:,.0f} "
            f"toward {deposit_doc['quick_loan_borrower_name'] or 'a quick loan'}."
        ),
        "url": "/dashboard",
    })
    await send_push_to_users([user["id"]], {
        "id": f"quick-loan-repayment-request-{deposit_doc['id']}",
        "type": "transaction_update",
        "title": "Repayment submitted",
        "body": "Your quick loan repayment is awaiting administrator approval.",
        "url": "/dashboard",
    })
    borrower_id = quick_loan.get("user_id")
    if borrower_id and borrower_id != user["id"]:
        await send_push_to_users([borrower_id], {
            "id": f"quick-loan-repayment-borrower-{deposit_doc['id']}",
            "type": "transaction_update",
            "title": "Guarantor repayment submitted",
            "body": "A repayment for your quick loan is awaiting administrator approval.",
            "url": "/dashboard",
        })

    return {
        "message": "Repayment submitted for administrator approval",
        "repayment": deposit_doc,
        "outstanding_balance": outstanding,
        "repaid": False,
    }


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
    if not approval.approved:
        await stop_pending_transaction_notification_repeats(approval.loan_id)

    await send_push_to_users([loan["user_id"]], {
        "id": f"loan-guarantor-status-{approval.loan_id}",
        "type": "transaction_update",
        "title": "Guarantor response received",
        "body": f"Your guarantor {new_status.replace('_', ' ')} your loan request.",
        "url": "/dashboard",
    })

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
            ql["guarantor_name"] = (
                ql.get("buyer_name") if ql.get("manual_repayment_terms")
                else ql.get("officer_name") or ql.get("officer_code") or "N/A"
            )
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
        await send_push_to_users([loan["user_id"]], {
            "id": f"loan-status-{approval.transaction_id}",
            "type": "transaction_update",
            "title": "Loan rejected",
            "body": f"Your UGX {float(loan.get('amount') or 0):,.0f} loan request was rejected.",
            "url": "/dashboard",
        })
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
    await stop_pending_transaction_notification_repeats(approval.transaction_id)

    await send_push_to_users([loan["user_id"]], {
        "id": f"loan-status-{approval.transaction_id}",
        "type": "transaction_update",
        "title": f"Loan {new_status}",
        "body": f"Your UGX {float(loan.get('amount') or 0):,.0f} loan request was {new_status}.",
        "url": "/dashboard",
    })
    
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

    await send_push_to_users([loan["user_id"]], {
        "id": f"loan-repayment-{loan_id}-{uuid4().hex}",
        "type": "transaction_update",
        "title": "Loan repayment recorded",
        "body": (
            f"UGX {payment_to_apply:,.0f} was applied to your loan. "
            f"Remaining balance: UGX {new_balance:,.0f}."
        ),
        "url": "/dashboard",
    })

    return {
        "message": "Payment recorded",
        "amount_paid": payment_to_apply,
        "total_repaid": loan.get("amount_repaid", 0) + payment_to_apply,
        "total_due": new_balance,
        "fully_repaid": new_balance <= 0
    }


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

