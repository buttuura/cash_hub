import asyncio
import importlib
import os
import re
import sys
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from bson import ObjectId


os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "cash_hub_test")
os.environ.setdefault("JWT_SECRET", "test-secret")


def matches(document, query):
    for key, expected in query.items():
        if key == "$and":
            if not all(matches(document, clause) for clause in expected):
                return False
            continue
        if key == "$or":
            if not any(matches(document, clause) for clause in expected):
                return False
            continue

        value = document.get(key)
        if isinstance(expected, dict):
            if "$ne" in expected and value == expected["$ne"]:
                return False
            if "$in" in expected and value not in expected["$in"] and not (
                value is None and None in expected["$in"]
            ):
                return False
            if "$regex" in expected:
                flags = re.IGNORECASE if expected.get("$options") == "i" else 0
                if value is None or not re.search(expected["$regex"], str(value), flags):
                    return False
        elif value != expected:
            return False
    return True


class FakeCursor:
    def __init__(self, documents):
        self.documents = list(documents)

    def sort(self, *_args):
        return self

    def limit(self, count):
        self.documents = self.documents[:count]
        return self

    async def to_list(self, length=None):
        return self.documents if length is None else self.documents[:length]


class FakeCollection:
    def __init__(self, documents=()):
        self.documents = list(documents)
        self.last_query = None

    def find(self, query, *_args):
        self.last_query = query
        return FakeCursor(document for document in self.documents if matches(document, query))

    async def find_one(self, query):
        return next((doc for doc in self.documents if matches(doc, query)), None)

    async def find_one_and_update(self, *_args, **_kwargs):
        return {"sequence": 1}

    async def insert_one(self, document):
        stored = dict(document)
        stored["_id"] = ObjectId()
        self.documents.append(stored)
        return SimpleNamespace(inserted_id=stored["_id"])


class FakeMongoClient:
    def __init__(self, *_args, **_kwargs):
        self.database = SimpleNamespace()

    def __getitem__(self, _name):
        return self.database


@pytest.fixture
def server_module():
    sys.modules.pop("backend.server", None)
    with patch("motor.motor_asyncio.AsyncIOMotorClient", return_value=FakeMongoClient()):
        module = importlib.import_module("backend.server")
        yield module


def test_create_order_uses_the_product_seller_account(server_module, monkeypatch):
    seller_id = ObjectId("507f1f77bcf86cd799439011")
    buyer_id = ObjectId("607f1f77bcf86cd799439012")
    product_id = ObjectId("707f1f77bcf86cd799439013")
    products = FakeCollection([{
        "_id": product_id,
        "seller_id": str(seller_id),
        "sellerName": "Stale product display name",
        "title": "Widget",
    }])
    users = FakeCollection([{"_id": seller_id, "name": "Actual seller"}])
    orders = FakeCollection()
    server_module.db = SimpleNamespace(
        products=products,
        users=users,
        orders=orders,
        receipt_counters=FakeCollection(),
    )
    broadcasts = []
    pushes = []

    async def capture_broadcast(target, _message):
        broadcasts.append(target)

    async def capture_push(name, _payload, target_id=None):
        pushes.append((name, target_id))

    monkeypatch.setattr(server_module.manager, "broadcast_to_seller", capture_broadcast)
    monkeypatch.setattr(server_module, "send_push_to_seller", capture_push)
    request = server_module.OrderCreate(
        productId=str(product_id),
        sellerName="Client supplied wrong seller",
        buyerName="Buyer",
    )

    created = asyncio.run(server_module.create_order(
        request,
        {"id": str(buyer_id), "name": "Buyer"},
    ))

    saved = orders.documents[0]
    assert saved["seller_id"] == str(seller_id)
    assert saved["sellerName"] == "Actual seller"
    assert created["seller_id"] == str(seller_id)
    assert broadcasts == [str(seller_id)]
    assert pushes == [("Actual seller", str(seller_id))]


def test_get_orders_scopes_members_by_seller_id_and_preserves_admin_access(server_module):
    seller_a = ObjectId("507f1f77bcf86cd799439011")
    seller_b = ObjectId("607f1f77bcf86cd799439012")
    user_a = {"id": str(seller_a), "name": "Member", "role": "member"}
    server_module.db = SimpleNamespace(
        users=FakeCollection([
            {"_id": seller_a, "name": "Member"},
            {"_id": seller_b, "name": "Member"},
        ]),
        orders=FakeCollection([
            {"_id": ObjectId(), "seller_id": str(seller_a), "sellerName": "Member"},
            {"_id": ObjectId(), "seller_id": str(seller_b), "sellerName": "Member"},
            {"_id": ObjectId(), "seller_id": str(seller_b), "buyerId": str(seller_a)},
            {"_id": ObjectId(), "sellerName": "Member"},
        ]),
    )

    member_orders = asyncio.run(server_module.get_orders(user_a))
    assert len(member_orders) == 2
    assert {order.get("seller_id") for order in member_orders} == {
        str(seller_a),
        str(seller_b),
    }
    assert all(
        order.get("seller_id") == str(seller_a) or order.get("buyerId") == str(seller_a)
        for order in member_orders
    )

    server_module.db.orders = FakeCollection([
        {"_id": ObjectId(), "seller_id": str(seller_a), "sellerName": "Member"},
        {"_id": ObjectId(), "seller_id": str(seller_b), "sellerName": "Member"},
        {"_id": ObjectId(), "seller_id": str(seller_b), "buyerId": str(seller_a)},
        {"_id": ObjectId(), "sellerName": "Member"},
    ])
    admin_orders = asyncio.run(server_module.get_orders({
        "id": "admin-id",
        "name": "Administrator",
        "role": "admin",
    }))
    assert len(admin_orders) == 4
