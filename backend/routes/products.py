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


async def add_seller_verification(products: List[dict]) -> None:
    seller_ids = {
        ObjectId(str(product["seller_id"]))
        for product in products
        if product.get("seller_id") and ObjectId.is_valid(str(product["seller_id"]))
    }
    if not seller_ids:
        for product in products:
            product["seller_verified"] = False
        return

    sellers = await db.users.find(
        {"_id": {"$in": list(seller_ids)}},
        {"is_verified": 1},
    ).to_list(1000)
    verified_seller_ids = {
        str(seller["_id"])
        for seller in sellers
        if seller.get("is_verified") is True
    }
    for product in products:
        product["seller_verified"] = str(product.get("seller_id") or "") in verified_seller_ids


@api_router.post("/products")
async def create_product(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    price: Optional[str] = Form(None),
    category: str = Form(...),
    contact_phone: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    location_url: Optional[str] = Form(None),
    latitude: Optional[str] = Form(None),
    longitude: Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
    images: List[UploadFile] = File(default=[]),
):
    parsed_price = float(price) if price is not None and str(price).strip() != "" else None
    if parsed_price is None and not contact_phone:
        raise HTTPException(status_code=400, detail="Provide either a price or a contact phone number")
    if parsed_price is not None and parsed_price < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative")

    parsed_latitude = None
    parsed_longitude = None
    if latitude is not None or longitude is not None:
        try:
            parsed_latitude = float(latitude)
            parsed_longitude = float(longitude)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Provide valid latitude and longitude coordinates")
        if not (-90 <= parsed_latitude <= 90 and -180 <= parsed_longitude <= 180):
            raise HTTPException(status_code=400, detail="Location coordinates are out of range")

    valid_images = [img for img in images if img and img.filename]
    upload_semaphore = asyncio.Semaphore(3)

    async def upload_product_image(img: UploadFile) -> str:
        async with upload_semaphore:
            upload_result = await upload_to_cloudinary(img)
        url = upload_result.get("secure_url") or upload_result.get("url")
        if not url:
            raise HTTPException(status_code=500, detail="Cloudinary upload failed: no URL returned")
        return url

    image_urls = await asyncio.gather(*(upload_product_image(img) for img in valid_images))

    product_data = {
        "title": title,
        "description": description,
        "price": parsed_price,
        "category": category,
        "contact_phone": contact_phone,
        "location": location.strip() if location else None,
        "location_url": location_url.strip() if location_url else None,
        "latitude": parsed_latitude,
        "longitude": parsed_longitude,
        "image_url": image_urls[0] if image_urls else None,
        "image_urls": image_urls,
        "seller_id": user.get("id"),
        "sellerName": user.get("name", user.get("full_name", "Member")),
        "seller_name": user.get("name", user.get("full_name", "Member")),
        "seller_verified": user.get("is_verified") is True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = await db.products.insert_one(product_data)
        logger.info(f"Product created: {title}")
    except Exception as e:
        logger.exception("Failed to save product")
        raise HTTPException(status_code=500, detail=f"Failed to save product: {str(e)}")

    product_data["id"] = str(result.inserted_id)
    product_data.pop("_id", None)
    return product_data


@api_router.get("/products")
async def list_products(user: Optional[dict] = Depends(get_current_user_optional)):
    query = {}
    is_admin = user and user.get("role") in ["admin", "super_admin", "treasurer"]
    if not is_admin:
        query = {"$or": [{"sold_out": {"$exists": False}}, {"sold_out": False}]}
    products = await db.products.find(query).sort("created_at", -1).to_list(200)
    await add_seller_verification(products)
    for product in products:
        product["id"] = str(product["_id"])
        product.pop("_id", None)
    return products


@api_router.get("/products/me")
async def list_my_products(user: dict = Depends(get_current_user)):
    products = await db.products.find({"seller_id": user["id"]}).sort("created_at", -1).to_list(200)
    await add_seller_verification(products)
    for product in products:
        product["id"] = str(product["_id"])
        product.pop("_id", None)
    return products


@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    from bson import ObjectId
    if not ObjectId.is_valid(product_id):
        return {}
    product = await db.products.find_one({"_id": ObjectId(product_id)})
    if not product:
        return {}
    await add_seller_verification([product])
    product["id"] = str(product["_id"])
    product.pop("_id", None)
    return product


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": oid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    is_admin = user.get("role") in ["admin", "super_admin", "treasurer"]
    is_owner = product.get("seller_id") == user.get("id")

    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="You can only delete your own products")

    result = await db.products.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    return {"message": "Product deleted", "id": product_id}


@api_router.post("/products/batch-delete")
async def batch_delete_products(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for product_id in data.order_ids:
        try:
            oid = ObjectId(product_id)
        except Exception:
            errors.append({"id": product_id, "error": "Invalid product id"})
            continue
        product = await db.products.find_one({"_id": oid})
        if not product:
            errors.append({"id": product_id, "error": "Product not found"})
            continue
        result = await db.products.delete_one({"_id": oid})
        if result.deleted_count > 0:
            deleted_ids.append(product_id)
        else:
            errors.append({"id": product_id, "error": "Delete failed"})
    return {"deleted": deleted_ids, "errors": errors}


@api_router.delete("/sellers")
async def delete_all_sellers(user: dict = Depends(require_treasurer)):
    result = await db.users.delete_many({"membership_type": "seller"})
    return {"message": f"Deleted {result.deleted_count} seller(s)", "deleted_count": result.deleted_count}


@api_router.delete("/products")
async def delete_all_products(user: dict = Depends(require_treasurer)):
    result = await db.products.delete_many({})
    return {"message": f"Deleted {result.deleted_count} product(s)", "deleted_count": result.deleted_count}


@api_router.patch("/products/{product_id}")
async def update_product(product_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": oid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    is_admin = user.get("role") in ["admin", "super_admin", "treasurer"]
    is_owner = product.get("seller_id") == user.get("id")
    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="You can only update your own products")

    # Whitelist updatable fields
    allowed_fields = {
        "sold_out", "title", "description", "price", "category", "image_url",
        "image_urls", "location", "location_url", "latitude", "longitude",
    }
    update_fields = {k: v for k, v in (payload or {}).items() if k in allowed_fields}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    await db.products.update_one({"_id": oid}, {"$set": update_fields})

    updated = await db.products.find_one({"_id": oid})
    updated["id"] = str(updated["_id"])
    updated.pop("_id", None)
    return updated

