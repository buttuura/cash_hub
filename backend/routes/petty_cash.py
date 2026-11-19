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

