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
        if deposit.get("status") == "approved" and deposit.get("deposit_type") == "quick_loan_payment":
            errors.append({"id": deposit_id, "error": "Approved quick loan repayments cannot be deleted"})
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


@api_router.post("/deposits/request")
async def request_deposit(deposit: DepositRequest, user: dict = Depends(get_current_user)):
    if deposit.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

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

    deposit_type = deposit.deposit_type
    allowed_deposit_types = ["savings", "loan_payment", "interest_payment", "development_fee"]
    
    if deposit_type not in allowed_deposit_types:
        raise HTTPException(status_code=400, detail="Invalid deposit type")
    
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

    if deposit.target_user_id and user.get("role") in ["super_admin", "treasurer"]:
        await _process_deposit_approval(
            TransactionApproval(
                transaction_id=deposit_doc["id"],
                approved=True,
                deduct_late_fee=deposit.deduct_late_fee,
            ),
            user,
        )
        approved_deposit = await db.deposits.find_one(
            {"_id": ObjectId(deposit_doc["id"])}
        )
        if not approved_deposit:
            raise HTTPException(status_code=500, detail="Approved deposit could not be loaded")
        approved_deposit["id"] = str(approved_deposit["_id"])
        approved_deposit.pop("_id", None)
        return approved_deposit

    await send_push_to_roles(["admin", "super_admin", "treasurer"], {
        "id": f"deposit-{deposit_doc['id']}",
        "type": "new_deposit",
        "deposit_id": deposit_doc["id"],
        "title": "Deposit received",
        "body": f"{deposit_doc.get('user_name') or 'A member'} deposited UGX {float(deposit_doc.get('amount') or 0):,.0f}",
        "url": "/dashboard",
    })
    await send_push_to_users([deposit_doc["user_id"]], {
        "id": f"deposit-request-{deposit_doc['id']}",
        "type": "transaction_update",
        "title": "Deposit request submitted",
        "body": f"Your UGX {float(deposit_doc.get('amount') or 0):,.0f} deposit is awaiting treasurer approval.",
        "url": "/dashboard",
    })

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
    return await _process_deposit_approval(approval, user)


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

    if deposit.get("status") == "approved" and deposit.get("deposit_type") == "quick_loan_payment":
        raise HTTPException(status_code=400, detail="Approved quick loan repayments cannot be deleted")
    
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

