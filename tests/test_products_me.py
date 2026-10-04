import asyncio
import importlib
import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from bson import ObjectId

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "cash_hub_test")
os.environ.setdefault("JWT_SECRET", "test-secret")


class FakeCursor:
    def __init__(self, items):
        self.items = items

    def sort(self, *_args, **_kwargs):
        return self

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
    with patch("motor.motor_asyncio.AsyncIOMotorClient", return_value=MagicMock()):
        module = importlib.import_module("backend.server")
        yield module
        module.app.dependency_overrides.clear()


class FakeInsertProductsCollection:
    def __init__(self):
        self.items = []

    async def insert_one(self, item):
        item["_id"] = ObjectId()
        self.items.append(item.copy())
        return SimpleNamespace(inserted_id=item["_id"])


def override_current_user(server_module):
    async def fake_get_current_user(_request: Request):
        return {"id": "user-1", "name": "Alice"}

    server_module.app.dependency_overrides[server_module.get_current_user] = fake_get_current_user


def test_products_me_returns_current_user_products(server_module):
    products = [{"_id": "product-1", "title": "Soap", "seller_id": "user-1"}]
    server_module.db.products = FakeProductsCollection(products)

    async def fake_get_current_user(request: Request):
        return {"id": "user-1", "name": "Alice"}

    app = server_module.app
    app.dependency_overrides[server_module.get_current_user] = fake_get_current_user

    with TestClient(app) as client:
        response = client.get("/api/products/me", headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Soap"
    assert response.json()[0]["id"] == "product-1"


def test_create_product_without_images(server_module):
    products = FakeInsertProductsCollection()
    server_module.db.products = products
    override_current_user(server_module)

    with TestClient(server_module.app) as client:
        response = client.post(
            "/api/products",
            headers={"Authorization": "Bearer test-token"},
            data={
                "title": "Handmade soap",
                "description": "Unscented soap",
                "price": "5000",
                "category": "health-beauty",
            },
        )

    assert response.status_code == 200
    saved_product = response.json()
    assert saved_product["title"] == "Handmade soap"
    assert saved_product["price"] == 5000
    assert saved_product["image_urls"] == []
    assert saved_product["seller_id"] == "user-1"
    assert len(products.items) == 1


def test_create_product_with_uploaded_image(server_module):
    products = FakeInsertProductsCollection()
    server_module.db.products = products
    override_current_user(server_module)
    cloudinary_upload = AsyncMock(
        return_value={"secure_url": "https://images.example.test/product.jpg"}
    )

    with patch.object(server_module, "upload_to_cloudinary", cloudinary_upload):
        with TestClient(server_module.app) as client:
            response = client.post(
                "/api/products",
                headers={"Authorization": "Bearer test-token"},
                data={
                    "title": "Handmade soap",
                    "category": "health-beauty",
                    "price": "5000",
                },
                files=[("images", ("product.jpg", b"test-image", "image/jpeg"))],
            )

    assert response.status_code == 200
    saved_product = response.json()
    assert saved_product["image_url"] == "https://images.example.test/product.jpg"
    assert saved_product["image_urls"] == ["https://images.example.test/product.jpg"]
    cloudinary_upload.assert_awaited_once()
    assert len(products.items) == 1


def test_create_product_uploads_multiple_images_concurrently(server_module):
    products = FakeInsertProductsCollection()
    server_module.db.products = products
    override_current_user(server_module)
    active_uploads = 0
    maximum_active_uploads = 0

    async def fake_upload_to_cloudinary(upload_file):
        nonlocal active_uploads, maximum_active_uploads
        active_uploads += 1
        maximum_active_uploads = max(maximum_active_uploads, active_uploads)
        await asyncio.sleep(0.01)
        active_uploads -= 1
        return {"secure_url": f"https://images.example.test/{upload_file.filename}"}

    with patch.object(server_module, "upload_to_cloudinary", fake_upload_to_cloudinary):
        with TestClient(server_module.app) as client:
            response = client.post(
                "/api/products",
                headers={"Authorization": "Bearer test-token"},
                data={
                    "title": "Handmade soap",
                    "category": "health-beauty",
                    "price": "5000",
                },
                files=[
                    ("images", ("front.jpg", b"front-image", "image/jpeg")),
                    ("images", ("back.jpg", b"back-image", "image/jpeg")),
                ],
            )

    assert response.status_code == 200
    assert maximum_active_uploads == 2
    assert response.json()["image_urls"] == [
        "https://images.example.test/front.jpg",
        "https://images.example.test/back.jpg",
    ]


def test_product_upload_cors_allows_bearer_authorization_without_credentials(server_module):
    with TestClient(server_module.app) as client:
        response = client.options(
            "/api/products",
            headers={
                "Origin": "https://c1group.site",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in response.headers


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
