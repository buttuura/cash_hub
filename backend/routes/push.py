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


@api_router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push notifications are not configured")
    return {"publicKey": VAPID_PUBLIC_KEY}


@api_router.post("/push/subscribe")
async def subscribe_to_push(subscription: PushSubscription, user: dict = Depends(get_current_user)):
    subscription_data = subscription.model_dump()
    await db.push_subscriptions.update_one(
        {"endpoint": subscription.endpoint},
        {"$set": {"user_id": user["id"], "subscription": subscription_data}},
        upsert=True,
    )
    return {"subscribed": True}


@api_router.delete("/push/subscribe")
async def unsubscribe_from_push(subscription: PushSubscription, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_one({
        "user_id": user["id"],
        "endpoint": subscription.endpoint,
    })
    return {"subscribed": False}


@api_router.post("/push/register")
async def register_fcm_token(registration: FCMTokenRegistration, user: dict = Depends(get_current_user)):
    await db.fcm_tokens.update_one(
        {"token": registration.token},
        {"$set": {"user_id": user["id"], "token": registration.token}},
        upsert=True,
    )
    return {"registered": True}


@api_router.delete("/push/register")
async def unregister_fcm_token(registration: FCMTokenRegistration, user: dict = Depends(get_current_user)):
    await db.fcm_tokens.delete_one({
        "user_id": user["id"],
        "token": registration.token,
    })
    return {"registered": False}

