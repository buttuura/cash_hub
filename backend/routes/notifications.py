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


@api_router.get("/notifications")
async def get_user_notifications(
    after: Optional[datetime] = Query(None),
    user: dict = Depends(get_current_user),
):
    query = {"user_id": user["id"]}
    if after:
        query["created_at"] = {"$gte": after.astimezone(timezone.utc)}

    notifications = await db.notifications.find(query).sort("created_at", 1).limit(100).to_list(100)
    for notification in notifications:
        notification["id"] = notification.get("event_id") or str(notification["_id"])
        notification.pop("_id", None)
    return notifications


@api_router.post("/notifications/{event_id}/read")
async def mark_notification_read(event_id: str, user: dict = Depends(get_current_user)):
    notification = await db.notifications.find_one(
        {"user_id": user["id"], "event_id": event_id},
    )
    result = await db.notifications.update_one(
        {
            "user_id": user["id"],
            "event_id": event_id,
            "read_at": None,
        },
        {
            "$set": {
                "read_at": datetime.now(timezone.utc),
                "next_repeat_at": None,
                "resolved_at": datetime.now(timezone.utc),
            }
        },
    )
    return {"marked_read": result.modified_count > 0}

