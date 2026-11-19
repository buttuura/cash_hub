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


@api_router.post("/orders")
async def create_order(order: OrderCreate, user: Optional[dict] = Depends(get_current_user_optional)):
    product_ids = []
    if order.productId:
        product_ids.append(order.productId)
    product_ids.extend(
        product.get("productId")
        for product in (order.products or [])
        if product.get("productId")
    )
    product_ids = list(dict.fromkeys(product_ids))
    if not product_ids or any(not is_valid_object_id(product_id) for product_id in product_ids):
        raise HTTPException(status_code=400, detail="A valid product is required to place an order")

    seller_products = []
    for product_id in product_ids:
        product = await db.products.find_one({"_id": ObjectId(product_id)})
        if not product:
            raise HTTPException(status_code=400, detail="An ordered product could not be found")
        seller_products.append(product)

    seller_ids = {str(product.get("seller_id") or "") for product in seller_products}
    if len(seller_ids) != 1 or not next(iter(seller_ids)) or not is_valid_object_id(next(iter(seller_ids))):
        raise HTTPException(status_code=400, detail="Ordered products must belong to one valid seller")

    seller_id = next(iter(seller_ids))
    seller_account = await db.users.find_one({"_id": ObjectId(seller_id)})
    if not seller_account:
        raise HTTPException(status_code=400, detail="The product seller account could not be found")
    seller_product = seller_products[0]

    order_created_at = datetime.now(timezone.utc)
    created_at = order_created_at.isoformat()
    receipt_date = order_created_at.astimezone(UGANDA_TIMEZONE).strftime("%Y%m%d")

    receipt_counter = await db.receipt_counters.find_one_and_update(
        {"_id": f"order-receipt:{receipt_date}"},
        {
            "$inc": {"sequence": 1},
            "$setOnInsert": {"date": receipt_date},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    receipt_number = f"C1SG-{receipt_date}-{int(receipt_counter['sequence']):03d}"
    order_doc = {
        "products": order.products,
        "productId": order.productId,
        "productTitle": order.productTitle,
        "productPrice": order.productPrice,
        "sellerName": (
            seller_account.get("name")
            or seller_product.get("sellerName")
            or seller_product.get("seller_name")
            or "Member"
        ).strip(),
        "seller_id": seller_id,
        "buyerId": order.buyerId,
        "buyerName": order.buyerName,
        "buyerEmail": order.buyerEmail,
        "buyerPhone": order.buyerPhone,
        "note": order.note,
        "total": order.total,
        "status": order.status,
        "created_at": created_at,
        "receipt_number": receipt_number,
        "status_history": [{
            "status": order.status,
            "updated_at": created_at,
        }],
    }

    if user:
        order_doc["buyerId"] = user["id"]
        order_doc["created_by"] = user["id"]
        if not order_doc.get("buyerName"):
            order_doc["buyerName"] = user["name"]

    result = await db.orders.insert_one(order_doc)
    order_doc["id"] = str(result.inserted_id)
    order_doc.pop("_id", None)
    
    # Send WebSocket notification to seller
    await manager.broadcast_to_seller(order_doc["seller_id"], {
        "type": "new_order",
        "order": order_doc
    })
    await send_push_to_seller(order_doc["sellerName"], {
        "id": f"order-{order_doc['id']}",
        "type": "new_order",
        "title": "New order received",
        "body": f"New order from {order_doc.get('buyerName') or 'a buyer'}",
        "url": "/dashboard",
        "order": order_doc,
    }, order_doc.get("seller_id"))
    if user:
        await send_push_to_users([user["id"]], {
            "id": f"order-placed-{order_doc['id']}",
            "type": "transaction_update",
            "title": "Order placed",
            "body": f"Your order for {order_doc.get('productTitle') or 'a product'} was sent to the seller.",
            "url": "/dashboard",
            "order_id": order_doc["id"],
        })
    
    return order_doc


@api_router.get("/orders")
async def get_orders(user: Optional[dict] = Depends(get_current_user_optional)):
    if not user:
        return []

    if user.get("role") in ["admin", "super_admin", "treasurer"]:
        orders = await db.orders.find({"deleted": {"$ne": True}}).sort("created_at", -1).to_list(1000)
    else:
        seller_conditions = [
            {"buyerId": user["id"]},
            {"seller_id": user["id"]},
        ]
        legacy_seller = await find_unique_legacy_seller(user.get("name"))
        if legacy_seller and str(legacy_seller["_id"]) == str(user["id"]):
            seller_conditions.append({
                "seller_id": {"$in": [None, ""]},
                "sellerName": {
                    "$regex": f"^{re.escape((user.get('name') or '').strip())}$",
                    "$options": "i",
                },
            })
        orders = await db.orders.find({
            "$and": [
                {"deleted": {"$ne": True}},
                {"$or": seller_conditions},
            ]
        }).sort("created_at", -1).to_list(1000)

    for order in orders:
        order["id"] = str(order["_id"])
        order.pop("_id", None)
    return orders


@api_router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, data: OrderStatusUpdate, user: Optional[dict] = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_admin = user.get("role") in ["admin", "super_admin", "treasurer"]
    is_seller = await order_belongs_to_seller(order, user)

    if not is_admin and not is_seller:
        raise HTTPException(status_code=403, detail="You can only update your own orders")

    allowed_statuses = ["pending", "approved", "processing", "shipped", "delivered", "rejected"]
    if data.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(allowed_statuses)}")

    current_status = str(order.get("status") or "pending").lower()
    allowed_transitions = {
        "pending": {"approved", "rejected"},
        "approved": {"processing", "shipped", "delivered", "rejected"},
        "processing": {"shipped", "delivered", "rejected"},
        "shipped": {"delivered"},
        "delivered": set(),
        "rejected": set(),
    }
    if data.status != current_status and data.status not in allowed_transitions.get(current_status, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Order cannot move from {current_status} to {data.status}",
        )
    if data.status == current_status:
        return {"message": f"Order already {data.status}"}

    now = datetime.now(timezone.utc)
    update_fields = {
        "status": data.status,
        "status_updated_at": now.isoformat(),
    }
    if data.status in ["shipped", "delivered"]:
        update_fields["shipped"] = True
        update_fields.setdefault("shipped_at", now.isoformat())
    if data.status == "delivered":
        update_fields["delivered"] = True
        update_fields["delivered_at"] = now.isoformat()
    if data.notes:
        update_fields["note"] = data.notes

    await db.orders.update_one(
        {"_id": ObjectId(order_id)},
        {
            "$set": update_fields,
            "$push": {
                "status_history": {
                    "status": data.status,
                    "updated_at": now.isoformat(),
                    "updated_by": user["id"],
                }
            },
        }
    )
    await db.notifications.update_one(
        {
            "event_id": f"order-{order_id}",
            "type": "new_order",
            "read_at": None,
        },
        {
            "$set": {
                "read_at": datetime.now(timezone.utc),
                "next_repeat_at": None,
            }
        },
    )

    buyer_id = order.get("buyerId") or order.get("created_by")
    if buyer_id and buyer_id != user["id"]:
        await send_push_to_users([buyer_id], {
            "id": f"order-status-{order_id}-{uuid4().hex}",
            "type": "order_status",
            "title": "Order status updated",
            "body": f"Your order is now {data.status.replace('_', ' ')}.",
            "url": "/dashboard",
            "order_id": order_id,
        })

    return {"message": f"Order {data.status}"}


@api_router.post("/orders/{order_id}/remind")
async def remind_order_seller(order_id: str, user: dict = Depends(get_current_user)):
    if not is_valid_object_id(order_id):
        raise HTTPException(status_code=400, detail="Invalid order id")

    order = await db.orders.find_one({"_id": ObjectId(order_id), "deleted": {"$ne": True}})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    buyer_id = order.get("buyerId") or order.get("created_by")
    if buyer_id != user["id"]:
        raise HTTPException(status_code=403, detail="You can only remind sellers about your own orders")

    seller_id = order.get("seller_id")
    if seller_id and is_valid_object_id(seller_id):
        seller = await db.users.find_one({"_id": ObjectId(seller_id)})
    elif not seller_id:
        seller = await find_unique_legacy_seller(order.get("sellerName"))
    else:
        seller = None
    if not seller:
        raise HTTPException(status_code=404, detail="Seller account could not be found")

    await send_push_to_users([str(seller["_id"])], {
        "id": f"order-reminder-{order_id}-{uuid4().hex}",
        "type": "order_reminder",
        "title": "Buyer reminder",
        "body": f"{order.get('buyerName') or 'A buyer'} is asking for an update on order #{order_id[-6:].upper()}.",
        "url": "/dashboard",
        "order_id": order_id,
    })
    await db.orders.update_one(
        {"_id": ObjectId(order_id)},
        {"$set": {"seller_reminder_sent_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Reminder sent to the seller"}


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user: Optional[dict] = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order id")

    order = await db.orders.find_one({"_id": oid, "deleted": {"$ne": True}})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_admin = user.get("role") in ["admin", "super_admin", "treasurer"]
    is_seller = await order_belongs_to_seller(order, user)
    is_buyer = order.get("buyerId") == user.get("id") or order.get("created_by") == user.get("id")

    if not (is_admin or is_seller or is_buyer):
        raise HTTPException(status_code=403, detail="You can only delete your own orders")

    if is_buyer and not is_admin:
        if str(order.get("status") or "").lower() != "delivered":
            raise HTTPException(status_code=400, detail="You can delete an order after it has been delivered")

    result = await db.orders.update_one(
        {"_id": oid},
        {"$set": {
            "deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user.get("name") or user.get("id"),
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")

    await db.notifications.update_many(
        {
            "event_id": f"order-{order_id}",
            "type": "new_order",
            "read_at": None,
        },
        {
            "$set": {
                "read_at": datetime.now(timezone.utc),
                "next_repeat_at": None,
            }
        },
    )

    return {"message": "Order deleted", "id": order_id}


@api_router.get("/orders/deleted")
async def get_deleted_orders(user: dict = Depends(require_treasurer)):
    orders = await db.orders.find({"deleted": True}).sort("created_at", -1).to_list(1000)
    for order in orders:
        order["id"] = str(order["_id"])
        order.pop("_id", None)
    return orders


@api_router.delete("/orders/{order_id}/permanent")
async def permanent_delete_order(order_id: str, user: dict = Depends(require_treasurer)):
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order id")

    result = await db.orders.delete_one({"_id": oid})
    if result.deleted_count == 0:
        fallback = await db.orders.find_one({"id": order_id})
        if fallback:
            await db.orders.delete_one({"_id": fallback["_id"]})
            return {"message": "Order permanently deleted", "id": order_id}
        raise HTTPException(status_code=404, detail="Order not found")

    return {"message": "Order permanently deleted", "id": order_id}


@api_router.post("/orders/batch-permanent")
async def batch_permanent_delete_orders(data: BatchOrderDelete, user: dict = Depends(require_treasurer)):
    deleted_ids = []
    errors = []
    for order_id in data.order_ids:
        try:
            oid = ObjectId(order_id)
        except Exception:
            errors.append({"id": order_id, "error": "Invalid order id"})
            continue
        result = await db.orders.delete_one({"_id": oid})
        if result.deleted_count == 0:
            fallback = await db.orders.find_one({"id": order_id})
            if fallback:
                await db.orders.delete_one({"_id": fallback["_id"]})
                deleted_ids.append(order_id)
            else:
                errors.append({"id": order_id, "error": "Order not found"})
        else:
            deleted_ids.append(order_id)
    return {"deleted": deleted_ids, "errors": errors}

