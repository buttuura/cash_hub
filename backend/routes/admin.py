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


@api_router.get("/admin/projects")
async def admin_list_projects(user: dict = Depends(require_admin)):
    """Return all projects including DB `_id` (as `db_id`) for admin operations."""
    projects = await db.projects.find({}).to_list(1000)
    out = []
    for p in projects:
        db_id = str(p.get("_id"))
        project_id = p.get("project_id") or p.get("id") or db_id
        p_out = p.copy()
        p_out["db_id"] = db_id
        p_out["project_id"] = project_id
        p_out.pop("_id", None)
        out.append(serialize_mongo_document(p_out))
    return out


@api_router.delete("/admin/projects")
async def admin_delete_projects(data: BatchProjectDelete, user: dict = Depends(require_admin)):
    """Delete projects by database `_id` or `project_id` (admin only).

    Example payload: {"ids": ["64b...", "project-123"]}
    """
    deleted = 0
    for ident in data.ids:
        # Try to delete by DB _id first
        try:
            oid = ObjectId(ident)
            res = await db.projects.delete_one({"_id": oid})
            if res.deleted_count:
                deleted += 1
                await db.project_comments.delete_many({"project_id": str(ident)})
                await db.project_ratings.delete_many({"project_id": str(ident)})
                continue
        except Exception:
            pass

        # Fall back to deleting by project_id
        res = await db.projects.delete_one({"project_id": ident})
        if res.deleted_count:
            deleted += 1
            await db.project_comments.delete_many({"project_id": ident})
            await db.project_ratings.delete_many({"project_id": ident})

    return {"deleted": deleted}


@api_router.post("/admin/set-role")
async def set_user_role(data: RoleUpdate, user: dict = Depends(require_treasurer)):
    if data.new_role not in ["admin", "member", "seller"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    target_user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("role") in ["super_admin", "treasurer"]:
        raise HTTPException(status_code=400, detail="Cannot change Treasurer role")

    update_fields = {"role": data.new_role}
    if data.new_role == "seller":
        update_fields["membership_type"] = "seller"
    elif target_user.get("role") == "seller":
        update_fields["membership_type"] = "ordinary"

    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": update_fields}
    )
    return {"message": f"User role updated to {data.new_role}"}


@api_router.post("/admin/set-membership")
async def set_membership_type(data: MembershipUpdate, user: dict = Depends(require_admin)):
    if data.membership_type not in ["premium", "ordinary", "seller"]:
        raise HTTPException(status_code=400, detail="Invalid membership type")
    
    target_user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_fields = {"membership_type": data.membership_type}
    if data.membership_type == "seller":
        update_fields["role"] = "seller"
    elif target_user.get("role") == "seller":
        update_fields["role"] = "member"

    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": update_fields}
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


@api_router.post("/admin/announcement")
async def save_announcement(data: AnnouncementMessage, user: dict = Depends(require_admin)):
    message = (data.message or '').strip()
    if not message:
        raise HTTPException(status_code=400, detail="Announcement message is required")

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "key": "group_announcement",
        "value": message,
        "author": user.get("name") or "Treasurer",
        "updated_at": now,
    }
    await db.settings.update_one({"key": "group_announcement"}, {"$set": payload}, upsert=True)

    history_doc = await db.settings.find_one({"key": "group_announcement_history"}) or {}
    history = history_doc.get("items", []) if isinstance(history_doc.get("items"), list) else []
    record = {
        "id": str(uuid4()),
        "message": message,
        "author": payload["author"],
        "updated_at": now,
    }
    history = [record] + [item for item in history if not (
        item.get("message") == message and item.get("author") == payload["author"] and item.get("updated_at") == now
    )]
    history = history[:200]
    await db.settings.update_one(
        {"key": "group_announcement_history"},
        {"$set": {"items": history, "updated_at": now}},
        upsert=True,
    )
    return {"message": "Announcement saved", "announcement": payload}


@api_router.get("/admin/announcements/history")
async def get_announcement_history(user: dict = Depends(require_admin)):
    history_doc = await db.settings.find_one({"key": "group_announcement_history"}) or {}
    items = history_doc.get("items", []) if isinstance(history_doc.get("items"), list) else []
    return sorted(items, key=lambda item: item.get("updated_at") or "", reverse=True)


@api_router.delete("/admin/announcement/{announcement_id}")
async def delete_announcement(announcement_id: str, user: dict = Depends(require_admin)):
    history_doc = await db.settings.find_one({"key": "group_announcement_history"}) or {}
    items = history_doc.get("items", []) if isinstance(history_doc.get("items"), list) else []
    deleted_item = next((item for item in items if item.get("id") == announcement_id), None)
    filtered = [item for item in items if item.get("id") != announcement_id]
    if len(filtered) == len(items):
        deleted_item = next(
            (item for item in items if item.get("message") == announcement_id or item.get("updated_at") == announcement_id),
            None,
        )
        filtered = [item for item in items if item.get("message") != announcement_id and item.get("updated_at") != announcement_id]
    await db.settings.update_one(
        {"key": "group_announcement_history"},
        {"$set": {"items": filtered, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    current = await db.settings.find_one({"key": "group_announcement"})
    if current and (
        current.get("id") == announcement_id
        or current.get("value") == announcement_id
        or current.get("updated_at") == announcement_id
        or (deleted_item and (
            current.get("value") == deleted_item.get("message")
            or current.get("updated_at") == deleted_item.get("updated_at")
        ))
    ):
        await db.settings.update_one(
            {"key": "group_announcement"},
            {"$set": {"value": "", "author": None, "updated_at": None}},
        )
    return {"message": "Announcement deleted"}

