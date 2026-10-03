import importlib
import os
import sys
from unittest.mock import MagicMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "cash_hub_test")
os.environ.setdefault("JWT_SECRET", "test-secret")


class FakeAppSettingsCollection:
    def __init__(self):
        self.documents = {}

    async def find_one(self, query):
        return self.documents.get(query["_id"])

    async def update_one(self, query, update, upsert=False):
        setting_id = query["_id"]
        document = self.documents.get(setting_id, {"_id": setting_id})
        document.update(update.get("$set", {}))
        self.documents[setting_id] = document
        return Mock()


@pytest.fixture
def server_module():
    sys.modules.pop("backend.server", None)
    with patch("motor.motor_asyncio.AsyncIOMotorClient", return_value=MagicMock()):
        module = importlib.import_module("backend.server")
        yield module
        module.app.dependency_overrides.clear()


@pytest.fixture
def settings_collection(server_module):
    collection = FakeAppSettingsCollection()
    server_module.db.app_settings = collection
    return collection


def test_shop_hero_poster_uses_default_when_unset(server_module, settings_collection):
    with TestClient(server_module.app) as client:
        response = client.get("/api/shop/hero-poster")

    assert response.status_code == 200
    assert response.json() == {"image_url": "/hero_bg_img.jpeg", "image_urls": []}


def test_shop_hero_poster_returns_saved_image(server_module, settings_collection):
    settings_collection.documents["shop_hero_poster"] = {
        "_id": "shop_hero_poster",
        "image_url": "https://cdn.example.com/seasonal-poster.jpg",
    }

    with TestClient(server_module.app) as client:
        response = client.get("/api/shop/hero-poster")

    assert response.status_code == 200
    assert response.json() == {
        "image_url": "https://cdn.example.com/seasonal-poster.jpg",
        "image_urls": ["https://cdn.example.com/seasonal-poster.jpg"],
    }


def test_shop_hero_poster_returns_all_saved_images(server_module, settings_collection):
    image_urls = [
        f"https://cdn.example.com/seasonal-poster-{index}.jpg"
        for index in range(5)
    ]
    settings_collection.documents["shop_hero_poster"] = {
        "_id": "shop_hero_poster",
        "image_url": image_urls[0],
        "image_urls": image_urls,
    }

    with TestClient(server_module.app) as client:
        response = client.get("/api/shop/hero-poster")

    assert response.status_code == 200
    assert response.json() == {"image_url": image_urls[0], "image_urls": image_urls}


def test_treasurer_can_update_shop_hero_poster(server_module, settings_collection):
    server_module.app.dependency_overrides[server_module.require_treasurer] = lambda: {
        "id": "treasurer-1",
        "role": "treasurer",
    }

    with TestClient(server_module.app) as client:
        response = client.put(
            "/api/shop/hero-poster",
            json={"image_url": "https://cdn.example.com/seasonal-poster.jpg"},
        )

    assert response.status_code == 200
    assert response.json() == {"image_url": "https://cdn.example.com/seasonal-poster.jpg"}
    assert settings_collection.documents["shop_hero_poster"]["updated_by"] == "treasurer-1"


def test_treasurer_can_add_and_remove_shop_hero_posters(server_module, settings_collection):
    server_module.app.dependency_overrides[server_module.require_treasurer] = lambda: {
        "id": "treasurer-1",
        "role": "treasurer",
    }
    existing_url = "https://cdn.example.com/existing-poster.jpg"
    added_url = "https://cdn.example.com/added-poster.jpg"
    settings_collection.documents["shop_hero_poster"] = {
        "_id": "shop_hero_poster",
        "image_url": existing_url,
        "image_urls": [existing_url],
    }

    with TestClient(server_module.app) as client:
        add_response = client.post(
            "/api/shop/hero-poster",
            json={"image_url": added_url},
        )
        delete_response = client.request(
            "DELETE",
            "/api/shop/hero-poster",
            json={"image_url": existing_url},
        )

    assert add_response.status_code == 200
    assert add_response.json() == {
        "image_url": existing_url,
        "image_urls": [existing_url, added_url],
    }
    assert delete_response.status_code == 200
    assert delete_response.json() == {"image_url": added_url, "image_urls": [added_url]}


def test_non_treasurer_cannot_update_shop_hero_poster(server_module, settings_collection, monkeypatch):
    async def regular_member(_request):
        return {"id": "member-1", "role": "member"}

    monkeypatch.setattr(server_module, "get_current_user", regular_member)

    with TestClient(server_module.app) as client:
        response = client.put(
            "/api/shop/hero-poster",
            headers={"Authorization": "Bearer test-token"},
            json={"image_url": "https://cdn.example.com/seasonal-poster.jpg"},
        )

    assert response.status_code == 403


def test_shop_hero_poster_rejects_non_https_url(server_module, settings_collection):
    server_module.app.dependency_overrides[server_module.require_treasurer] = lambda: {
        "id": "treasurer-1",
        "role": "treasurer",
    }

    with TestClient(server_module.app) as client:
        response = client.put(
            "/api/shop/hero-poster",
            json={"image_url": "http://cdn.example.com/seasonal-poster.jpg"},
        )

    assert response.status_code == 400