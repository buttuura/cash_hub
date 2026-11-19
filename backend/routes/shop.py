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


@api_router.get("/shop/hero-poster")
async def get_shop_hero_poster():
    poster = await db.app_settings.find_one({"_id": "shop_hero_poster"})
    image_urls = get_shop_hero_poster_urls(poster)
    return {
        "image_url": image_urls[0] if image_urls else "/hero_bg_img.jpeg",
        "image_urls": image_urls,
    }


@api_router.put("/shop/hero-poster")
async def update_shop_hero_poster(data: HeroPosterUpdate, user: dict = Depends(require_treasurer)):
    image_url = data.image_url.strip()
    if not image_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Poster image URL must use HTTPS")

    await db.app_settings.update_one(
        {"_id": "shop_hero_poster"},
        {"$set": {
            "image_url": image_url,
            "image_urls": [image_url],
            "updated_by": user["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"image_url": image_url}


@api_router.post("/shop/hero-poster")
async def add_shop_hero_poster(data: HeroPosterUpdate, user: dict = Depends(require_treasurer)):
    image_url = data.image_url.strip()
    if not image_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Poster image URL must use HTTPS")

    poster = await db.app_settings.find_one({"_id": "shop_hero_poster"})
    image_urls = get_shop_hero_poster_urls(poster)
    if image_url not in image_urls:
        image_urls.append(image_url)

    await db.app_settings.update_one(
        {"_id": "shop_hero_poster"},
        {"$set": {
            "image_url": image_urls[0] if image_urls else image_url,
            "image_urls": image_urls,
            "updated_by": user["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"image_url": image_urls[0], "image_urls": image_urls}


@api_router.delete("/shop/hero-poster")
async def delete_shop_hero_poster(data: HeroPosterUpdate, user: dict = Depends(require_treasurer)):
    image_url = data.image_url.strip()
    poster = await db.app_settings.find_one({"_id": "shop_hero_poster"})
    image_urls = get_shop_hero_poster_urls(poster)
    if image_url not in image_urls:
        raise HTTPException(status_code=404, detail="Poster not found")

    image_urls = [saved_url for saved_url in image_urls if saved_url != image_url]
    await db.app_settings.update_one(
        {"_id": "shop_hero_poster"},
        {"$set": {
            "image_url": image_urls[0] if image_urls else "/hero_bg_img.jpeg",
            "image_urls": image_urls,
            "updated_by": user["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {
        "image_url": image_urls[0] if image_urls else "/hero_bg_img.jpeg",
        "image_urls": image_urls,
    }

