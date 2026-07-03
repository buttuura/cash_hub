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
