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


@api_router.get("/notification-settings")
async def get_notification_settings(user: dict = Depends(get_current_user)):
    settings = user.get("notification_settings") or {}
    return {
        "order_sound_enabled": bool(settings.get("order_sound_enabled", True)),
    }


@api_router.put("/notification-settings")
async def update_notification_settings(
    settings: NotificationSettingsUpdate,
    user: dict = Depends(get_current_user),
):
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"notification_settings.order_sound_enabled": settings.order_sound_enabled}},
    )
    if not settings.order_sound_enabled:
        await db.notifications.update_many(
            {
                "user_id": user["id"],
                "type": "new_order",
                "read_at": None,
            },
            {
                "$set": {
                    "sound_enabled": False,
                    "next_repeat_at": None,
                }
            },
        )
    return {"order_sound_enabled": settings.order_sound_enabled}


@api_router.get("/announcements/current")
async def get_current_announcement(user: dict = Depends(get_current_user)):
    announcement = await db.settings.find_one({"key": "group_announcement"})
    if not announcement or not announcement.get("value"):
        return {"message": "", "author": None, "updated_at": None}

    return {
        "message": announcement.get("value", ""),
        "author": announcement.get("author"),
        "updated_at": announcement.get("updated_at"),
    }


@api_router.get("/")
async def root():
    return {"message": "Class One Savings API", "version": "2.0.0"}

