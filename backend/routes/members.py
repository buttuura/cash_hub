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


@api_router.get("/members")
async def get_members(user: dict = Depends(get_current_user)):
    members = await db.users.find({"role": {"$nin": ["super_admin", "treasurer"]}}, {"password_hash": 0}).to_list(1000)
    result = []
    is_treasurer = user.get("role") in ["super_admin", "treasurer"]
    patron_ids = {
        ObjectId(str(member["patron_id"]))
        for member in members
        if member.get("patron_id") and ObjectId.is_valid(str(member["patron_id"]))
    }
    patrons = await db.users.find(
        {"_id": {"$in": list(patron_ids)}},
        {"name": 1},
    ).to_list(1000) if patron_ids else []
    patrons_by_id = {str(patron["_id"]): patron for patron in patrons}
    
    for m in members:
        m["id"] = str(m["_id"])
        m.pop("_id", None)
        patron = patrons_by_id.get(str(m.get("patron_id")))
        m["patron"] = {
            "id": str(patron["_id"]),
            "name": patron.get("name"),
        } if patron else ({
            "id": str(m.get("patron_id")),
            "name": m.get("patron_name"),
        } if m.get("patron_name") or m.get("patron_id") else None)
        m.pop("patron_member_code", None)
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
    member.pop("patron_member_code", None)
    
    # Hide admin role from non-super-admins
    if user.get("role") not in ["super_admin", "treasurer"] and member.get("role") in ["admin", "super_admin", "treasurer"]:
        member["role"] = "member"
    max_guarantees = member.get("max_guarantees", MAX_GUARANTEES_PER_MEMBER)
    member["remaining_guarantee_slots"] = await get_member_remaining_guarantee_slots(member["id"], max_guarantees)
    return member


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

