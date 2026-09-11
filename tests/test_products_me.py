import importlib
import os
import sys
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "cash_hub_test")
os.environ.setdefault("JWT_SECRET", "test-secret")


class FakeCursor:
    def __init__(self, items):
        self.items = items

    async def to_list(self, *_args, **_kwargs):
        return self.items


class FakeProductsCollection:
    def __init__(self, items):
        self.items = items

    def find(self, query):
        assert query == {"seller_id": "user-1"}
        return FakeCursor(self.items)


@pytest.fixture
def server_module():
    sys.modules.pop("backend.server", None)
    with patch("motor.motor_asyncio.AsyncIOMotorClient", return_value=Mock()):
        module = importlib.import_module("backend.server")
        yield module


def test_products_me_returns_current_user_products(server_module):
    products = [{"_id": "product-1", "title": "Soap", "seller_id": "user-1"}]
    server_module.db.products = FakeProductsCollection(products)

    async def fake_get_current_user(request):
        return {"id": "user-1", "name": "Alice"}

    app = server_module.app
    app.dependency_overrides[server_module.get_current_user] = fake_get_current_user

    with TestClient(app) as client:
        response = client.get("/api/products/me", headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Soap"
    assert response.json()[0]["id"] == "product-1"


def test_set_membership_type_syncs_role_for_non_seller_accounts(server_module):
    member = {
        "_id": "user-1",
        "id": "user-1",
        "name": "Alice",
        "role": "seller",
        "membership_type": "seller",
    }

    class FakeUsersCollection:
        async def find_one(self, query):
            return member

        async def update_one(self, query, update):
            member.update(update.get("$set", {}))
            return Mock()

    server_module.db.users = FakeUsersCollection()
    server_module.ObjectId = lambda value: value

    response = __import__("asyncio").run(
        server_module.set_membership_type(
            server_module.MembershipUpdate(user_id="user-1", membership_type="premium"),
            user={"role": "admin"},
        )
    )

    assert response["message"] == "Membership updated to premium"
    assert member["membership_type"] == "premium"
    assert member["role"] == "member"


def test_register_defaults_new_users_to_seller_membership(server_module):
    class FakeUsersCollection:
        def __init__(self):
            self.inserted = None

        async def find_one(self, query):
            return None

        async def insert_one(self, doc):
            self.inserted = doc
            return Mock(inserted_id="user-1")

    fake_users = FakeUsersCollection()
    server_module.db.users = fake_users

    response = __import__("asyncio").run(
        server_module.register(
            server_module.UserCreate(
                name="Alice",
                phone="0771234567",
                password="secret123",
                next_of_kin_name="Jane",
                next_of_kin_phone="0700000000",
            )
        )
    )

    assert response["membership_type"] == "seller"
    assert fake_users.inserted["membership_type"] == "seller"
