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

