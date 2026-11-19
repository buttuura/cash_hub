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


@api_router.post("/withdrawals/request")
async def request_withdrawal(withdrawal: WithdrawalRequest, user: dict = Depends(get_current_user)):
    if withdrawal.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    user_data = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    if withdrawal.withdrawal_type == "leaving_group":
        active_withdrawal = await db.withdrawals.find_one({
            "user_id": user["id"],
            "status": {"$in": ["waiting_period", "pending"]}
        })
        if active_withdrawal:
            raise HTTPException(status_code=400, detail="You already have a withdrawal request in progress")

        active_loan = await db.loans.find_one({
            "user_id": user["id"],
            "status": "approved",
            "repaid": False
        })
        if active_loan:
            raise HTTPException(status_code=400, detail="Clear your loan before requesting to withdraw all funds")

        guaranteeing = await db.loans.find_one({
            "guarantor_id": user["id"],
            "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
            "repaid": False
        })
        if guaranteeing:
            raise HTTPException(status_code=400, detail="You are guaranteeing a loan. Wait for it to be repaid.")

        savings_amount = float(user_data.get("total_savings", 0) or 0)
        development_fund_amount = float(user_data.get("development_fund", 0) or 0)
        max_amount = savings_amount + development_fund_amount
        if abs(withdrawal.amount - max_amount) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Leaving-group withdrawals must include your full balance of UGX {max_amount:,.0f}"
            )

        created_at = datetime.now(timezone.utc)
        approval_available_at = created_at + timedelta(days=60)
        withdrawal_status = "waiting_period"
    else:
        if await db.withdrawals.find_one({
            "user_id": user["id"],
            "withdrawal_type": "leaving_group",
            "status": {"$in": ["waiting_period", "pending"]}
        }):
            raise HTTPException(status_code=400, detail="A full withdrawal request is in progress")
        # Regular withdrawal - only from savings, not development fund
        if withdrawal.amount > user_data.get("total_savings", 0):
            raise HTTPException(status_code=400, detail="Insufficient savings (development fund cannot be withdrawn)")
        savings_amount = withdrawal.amount
        development_fund_amount = 0
        created_at = datetime.now(timezone.utc)
        approval_available_at = None
        withdrawal_status = "pending"
    
    withdrawal_doc = {
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user.get("email"),
        "amount": withdrawal.amount,
        "withdrawal_type": withdrawal.withdrawal_type,
        "savings_amount": savings_amount,
        "development_fund_amount": development_fund_amount,
        "reason": withdrawal.reason,
        "status": withdrawal_status,
        "created_at": created_at.isoformat(),
        "approval_available_at": approval_available_at.isoformat() if approval_available_at else None,
        "approved_at": None,
        "approved_by": None
    }
    
    result = await db.withdrawals.insert_one(withdrawal_doc)
    withdrawal_doc["id"] = str(result.inserted_id)
    withdrawal_doc.pop("_id", None)

    if withdrawal_status == "waiting_period":
        await send_push_to_roles(["treasurer"], {
            "id": f"withdrawal-notice-treasurer-{withdrawal_doc['id']}",
            "type": "new_withdrawal",
            "title": "Full withdrawal notice started",
            "body": (
                f"{withdrawal_doc.get('user_name') or 'A member'} started a 60-day notice "
                f"to withdraw UGX {float(withdrawal_doc.get('amount') or 0):,.0f}. "
                f"It will be ready for approval on {approval_available_at:%d %b %Y}."
            ),
            "url": "/dashboard",
        })
        await send_push_to_users([withdrawal_doc["user_id"]], {
            "id": f"withdrawal-notice-{withdrawal_doc['id']}",
            "type": "transaction_update",
            "title": "Two-month withdrawal notice started",
            "body": "Your full-balance withdrawal will be sent to the treasurer for approval after the 60-day notice period.",
            "url": "/dashboard",
        })
        return withdrawal_doc

    await send_push_to_roles(["treasurer"], {
        "id": f"withdrawal-{withdrawal_doc['id']}",
        "type": "new_withdrawal",
        "pending_transaction_id": withdrawal_doc["id"],
        "pending_transaction_collection": "withdrawals",
        "pending_statuses": ["pending"],
        "title": "Withdrawal requested",
        "body": f"{withdrawal_doc.get('user_name') or 'A member'} requested UGX {float(withdrawal_doc.get('amount') or 0):,.0f}",
        "url": "/dashboard",
    })
    await send_push_to_users([withdrawal_doc["user_id"]], {
        "id": f"withdrawal-request-{withdrawal_doc['id']}",
        "type": "transaction_update",
        "title": "Withdrawal request submitted",
        "body": f"Your UGX {float(withdrawal_doc.get('amount') or 0):,.0f} withdrawal is awaiting approval.",
        "url": "/dashboard",
    })

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

    if (
        withdrawal.get("withdrawal_type") == "leaving_group"
        and withdrawal.get("approval_available_at")
        and datetime.now(timezone.utc) < datetime.fromisoformat(
            withdrawal["approval_available_at"].replace("Z", "+00:00")
        )
    ):
        raise HTTPException(status_code=400, detail="The 60-day notice period is not complete")
    
    new_status = "approved" if approval.approved else "rejected"
    
    if approval.approved:
        user_data = await db.users.find_one({"_id": ObjectId(withdrawal["user_id"])})
        
        if withdrawal.get("withdrawal_type") == "leaving_group":
            active_loan = await db.loans.find_one({
                "user_id": withdrawal["user_id"],
                "status": "approved",
                "repaid": False
            })
            if active_loan:
                raise HTTPException(status_code=400, detail="Member has an active loan")

            guaranteeing = await db.loans.find_one({
                "guarantor_id": withdrawal["user_id"],
                "status": {"$in": ["pending_guarantor", "pending_admin", "approved"]},
                "repaid": False
            })
            if guaranteeing:
                raise HTTPException(status_code=400, detail="Member is guaranteeing an active loan")

            savings_amount = float(withdrawal.get("savings_amount", user_data.get("total_savings", 0)) or 0)
            development_fund_amount = float(
                withdrawal.get("development_fund_amount", user_data.get("development_fund", 0)) or 0
            )
            if (
                float(user_data.get("total_savings", 0) or 0) < savings_amount
                or float(user_data.get("development_fund", 0) or 0) < development_fund_amount
            ):
                raise HTTPException(status_code=400, detail="Insufficient funds")
            
            await db.users.update_one(
                {"_id": ObjectId(withdrawal["user_id"])},
                {"$inc": {
                    "total_savings": -savings_amount,
                    "development_fund": -development_fund_amount,
                }}
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
    await stop_pending_transaction_notification_repeats(approval.transaction_id)

    await send_push_to_users([withdrawal["user_id"]], {
        "id": f"withdrawal-status-{approval.transaction_id}",
        "type": "transaction_update",
        "title": f"Withdrawal {new_status}",
        "body": f"Your UGX {float(withdrawal.get('amount') or 0):,.0f} withdrawal was {new_status}.",
        "url": "/dashboard",
    })
    
    return {"message": f"Withdrawal {new_status}"}


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

