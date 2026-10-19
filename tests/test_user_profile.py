import asyncio
import importlib
import os
import sys
from io import BytesIO
from unittest.mock import AsyncMock, patch

import pytest
from bson import ObjectId
from fastapi import HTTPException
from starlette.datastructures import UploadFile


os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "cash_hub_test")
os.environ.setdefault("JWT_SECRET", "test-secret")


@pytest.fixture
def server_module():
    sys.modules.pop("backend.server", None)
    with patch("motor.motor_asyncio.AsyncIOMotorClient"):
        yield importlib.import_module("backend.server")


def test_profile_picture_upload_saves_url_to_authenticated_user(server_module, monkeypatch):
    user_id = ObjectId("507f1f77bcf86cd799439011")
    updates = []

    class FakeUsersCollection:
        async def update_one(self, query, update):
            updates.append((query, update))

    server_module.db.users = FakeUsersCollection()
    upload = AsyncMock(return_value={"secure_url": "https://images.example/profile.webp"})
    monkeypatch.setattr(server_module, "upload_to_cloudinary", upload)

    result = asyncio.run(server_module.upload_profile_picture(
        UploadFile(filename="profile.webp", file=BytesIO(b"image"), headers={"content-type": "image/webp"}),
        {"id": str(user_id)},
    ))

    assert result == {"profile_picture_url": "https://images.example/profile.webp"}
    upload.assert_awaited_once()
    assert upload.await_args.kwargs["folder"] == "cash_hub/profile-pictures"
    assert updates == [(
        {"_id": user_id},
        {"$set": {"profile_picture_url": "https://images.example/profile.webp"}},
    )]


def test_profile_picture_upload_rejects_non_image_file(server_module, monkeypatch):
    upload = AsyncMock()
    monkeypatch.setattr(server_module, "upload_to_cloudinary", upload)

    with pytest.raises(HTTPException) as error:
        asyncio.run(server_module.upload_profile_picture(
            UploadFile(filename="document.pdf", file=BytesIO(b"file"), headers={"content-type": "application/pdf"}),
            {"id": "507f1f77bcf86cd799439011"},
        ))

    assert error.value.status_code == 400
    upload.assert_not_awaited()
