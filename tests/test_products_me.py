import asyncio
import importlib
import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import HTTPException, Request
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


def test_product_listing_exposes_verified_seller_status(server_module):
    verified_id = ObjectId()
    unverified_id = ObjectId()
    products = [
        {"_id": ObjectId(), "seller_id": str(verified_id), "sellerName": "Verified Seller"},
        {"_id": ObjectId(), "seller_id": str(unverified_id), "sellerName": "Other Seller"},
    ]

    class FakeProductsCollection:
        def find(self, _query):
            return FakeCursorWithSort(products)

    class FakeCursorWithSort(FakeCursor):
        def sort(self, *_args, **_kwargs):
            return self

    class FakeUsersCollection:
        def find(self, query, _projection):
            assert set(query["_id"]["$in"]) == {verified_id, unverified_id}
            return FakeCursor([{"_id": verified_id, "is_verified": True}])

    server_module.db.products = FakeProductsCollection()
    server_module.db.users = FakeUsersCollection()

    response = asyncio.run(server_module.list_products(None))

    assert response[0]["seller_verified"] is True
    assert response[1]["seller_verified"] is False


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
                email="Alice.Example@Example.COM",
                phone="0771234567",
                password="secret123",
                next_of_kin_name="Jane",
                next_of_kin_phone="0700000000",
            )
        )
    )

    assert response["membership_type"] == "seller"
    assert fake_users.inserted["membership_type"] == "seller"
    assert response["email"] == "Alice.Example@Example.COM"
    assert fake_users.inserted["email"] == "Alice.Example@Example.COM"
    assert fake_users.inserted["normalized_email"] == "alice.example@example.com"


def test_premium_registration_requires_patron_code(server_module):
    server_module.db.users = MagicMock()
    server_module.db.users.find_one = AsyncMock(return_value=None)
    server_module.db.users.insert_one = AsyncMock()

    with pytest.raises(HTTPException) as error:
        asyncio.run(server_module.register(
            server_module.UserCreate(
                name="Alice",
                phone="0771234567",
                password="secret123",
                next_of_kin_name="Jane",
                next_of_kin_phone="0700000000",
                membership_type="premium",
            )
        ))

    assert error.value.status_code == 400
    assert "patron member code is required" in error.value.detail.lower()
    server_module.db.users.insert_one.assert_not_awaited()


def test_premium_registration_links_existing_patron(server_module):
    patron_id = ObjectId()
    patron = {
        "_id": patron_id,
        "name": "Patron Person",
        "member_code": "pat1234",
        "is_verified": True,
    }

    class FakeUsersCollection:
        inserted = None

        async def find_one(self, query):
            if "member_code" in query:
                return patron
            return None

        async def insert_one(self, document):
            self.inserted = document
            return Mock(inserted_id=ObjectId())

    users = FakeUsersCollection()
    server_module.db.users = users
    response = asyncio.run(server_module.register(
        server_module.UserCreate(
            name="Alice",
            phone="0771234567",
            password="secret123",
            next_of_kin_name="Jane",
            next_of_kin_phone="0700000000",
            membership_type="premium",
            patron_code=" PAT1234 ",
        )
    ))

    assert users.inserted["role"] == "member"
    assert users.inserted["patron_id"] == str(patron_id)
    assert response["patron"] == {
        "id": str(patron_id),
        "name": "Patron Person",
    }


def test_member_can_link_patron_from_settings(server_module):
    patron_id = ObjectId()
    current_user_id = ObjectId()
    patron = {
        "_id": patron_id,
        "name": "Patron Person",
        "member_code": "pat1234",
        "is_verified": True,
    }
    server_module.db.users.find_one = AsyncMock(return_value=patron)
    server_module.db.users.update_one = AsyncMock()

    response = asyncio.run(server_module.set_patron(
        server_module.PatronCodeUpdate(patron_code="pat1234"),
        user={"id": str(current_user_id)},
    ))

    assert response["patron"]["name"] == "Patron Person"
    assert "member_code" not in response["patron"]
    update = server_module.db.users.update_one.await_args
    assert update.args[0] == {"_id": current_user_id}
    assert update.args[1]["$set"]["patron_id"] == str(patron_id)


def test_member_list_includes_patron_name_without_disclosing_patron_code(server_module):
    member_id = ObjectId()
    patron_id = ObjectId()
    member = {
        "_id": member_id,
        "name": "Alice Member",
        "role": "member",
        "patron_id": str(patron_id),
        "patron_name": "Patron Person",
        "patron_member_code": "pat1234",
    }
    patron = {"_id": patron_id, "name": "Patron Person", "member_code": "pat1234"}
    users = MagicMock()
    users.find.side_effect = [FakeCursor([member]), FakeCursor([patron])]
    server_module.db.users = users
    server_module.db.loans = SimpleNamespace(count_documents=AsyncMock(return_value=0))

    members = asyncio.run(server_module.get_members({"role": "admin"}))

    assert members[0]["patron"] == {
        "id": str(patron_id),
        "name": "Patron Person",
    }
    assert "patron_member_code" not in members[0]
    assert "member_code" not in members[0]["patron"]


def test_auth_me_hides_patron_code_but_includes_patron_name(server_module):
    patron_id = ObjectId()
    member_id = ObjectId()
    server_module.db.users.find_one = AsyncMock(return_value={
        "_id": patron_id,
        "name": "Patron Person",
        "member_code": "pat1234",
    })
    user = {
        "id": str(member_id),
        "name": "Alice Member",
        "member_code": "ali4567",
        "patron_id": str(patron_id),
        "patron_name": "Patron Person",
        "patron_member_code": "pat1234",
    }

    profile = asyncio.run(server_module.get_me(user))

    assert profile["patron"] == {"id": str(patron_id), "name": "Patron Person"}
    assert "patron_member_code" not in profile


def test_unverified_member_code_cannot_be_used_as_a_patron_code(server_module):
    class FakeUsersCollection:
        async def find_one(self, query):
            assert query["is_verified"] is True
            return None

        def find(self, query, _projection):
            assert query["is_verified"] is True
            return FakeCursor([])

    server_module.db.users = FakeUsersCollection()

    patron = asyncio.run(server_module.find_patron_by_code("unverified1"))

    assert patron is None


def test_admin_can_verify_or_unverify_a_member(server_module):
    member_id = ObjectId()
    server_module.db.users.find_one = AsyncMock(return_value={"_id": member_id, "role": "member"})
    server_module.db.users.update_one = AsyncMock()

    response = asyncio.run(
        server_module.set_member_verification(
            server_module.MemberVerificationUpdate(user_id=str(member_id), verified=True),
            user={"role": "admin"},
        )
    )

    assert response["verified"] is True
    server_module.db.users.update_one.assert_awaited_once_with(
        {"_id": member_id},
        {"$set": {"is_verified": True}},
    )


def test_admin_account_can_be_verified(server_module):
    admin_id = ObjectId()
    server_module.db.users.find_one = AsyncMock(return_value={"_id": admin_id, "role": "admin"})
    server_module.db.users.update_one = AsyncMock()

    response = asyncio.run(
        server_module.set_member_verification(
            server_module.MemberVerificationUpdate(user_id=str(admin_id), verified=True),
            user={"role": "admin"},
        )
    )

    assert response["verified"] is True
    server_module.db.users.update_one.assert_awaited_once_with(
        {"_id": admin_id},
        {"$set": {"is_verified": True}},
    )


@pytest.mark.parametrize(
    ("provided_code", "expected_code"),
    [(None, "ali4567"), ("GROUP-ALICE", "GROUP-ALICE")],
)
def test_treasurer_can_assign_generated_or_custom_member_code(server_module, provided_code, expected_code):
    member_id = ObjectId()
    target_user = {
        "_id": member_id,
        "name": "Alice Member",
        "phone": "0771234567",
        "role": "member",
    }

    class FakeUsersCollection:
        async def find_one(self, query):
            return target_user if query == {"_id": member_id} else None

        async def update_one(self, _query, update):
            target_user.update(update["$set"])
            return SimpleNamespace(modified_count=1)

    server_module.db.users = FakeUsersCollection()

    result = asyncio.run(
        server_module.assign_member_code(
            server_module.MemberCodeUpdate(
                user_id=str(member_id),
                member_code=provided_code,
            ),
            user={"role": "treasurer"},
        )
    )

    assert result["member_code"] == expected_code
    assert target_user["member_code"] == expected_code


def test_admin_can_change_existing_member_code(server_module):
    member_id = ObjectId()
    target_user = {
        "_id": member_id,
        "name": "Alice Member",
        "phone": "0771234567",
        "role": "member",
        "member_code": "old-code",
    }

    class FakeUsersCollection:
        async def find_one(self, query):
            return target_user if query == {"_id": member_id} else None

        async def update_one(self, query, update):
            assert query == {"_id": member_id, "member_code": "old-code"}
            target_user.update(update["$set"])
            return SimpleNamespace(modified_count=1)

    server_module.db.users = FakeUsersCollection()

    result = asyncio.run(
        server_module.assign_member_code(
            server_module.MemberCodeUpdate(user_id=str(member_id), member_code="new-code"),
            user={"role": "admin"},
        )
    )

    assert result["member_code"] == "new-code"
    assert target_user["member_code"] == "new-code"


def test_verified_admin_code_can_be_used_as_a_patron_code(server_module):
    admin = {
        "_id": ObjectId(),
        "name": "Group Admin",
        "member_code": "admin123",
        "is_verified": True,
        "role": "admin",
    }

    async def find_one(query):
        assert query["is_verified"] is True
        assert query["role"] == {"$nin": ["super_admin", "treasurer"]}
        return admin

    server_module.db.users.find_one = AsyncMock(side_effect=find_one)

    patron = asyncio.run(server_module.find_patron_by_code("ADMIN123"))

    assert patron == admin


def test_quick_loan_codes_include_existing_members_without_saved_codes(server_module):
    legacy_member = {
        "_id": ObjectId(),
        "name": "Alice Member",
        "phone": "0771234567",
    }

    class FakeUsersCollection:
        def __init__(self):
            self.updated = []

        def find(self, _query, _projection):
            return FakeCursor([legacy_member])

        async def update_one(self, query, update):
            self.updated.append((query, update))

    users = FakeUsersCollection()
    server_module.db.users = users

    response = asyncio.run(server_module.get_quick_loan_valid_codes())

    assert {"code": "ali4567", "label": "Alice Member (ali4567)", "type": "member"} in response["members"]
    assert users.updated == [
        (
            {"_id": legacy_member["_id"]},
            {"$set": {"member_code": "ali4567"}},
        )
    ]


def test_legacy_member_code_can_be_used_as_a_patron_code(server_module):
    legacy_member = {
        "_id": ObjectId(),
        "name": "Alice Member",
        "phone": "0771234567",
        "is_verified": True,
    }

    class FakeUsersCollection:
        def __init__(self):
            self.updated = []

        async def find_one(self, _query):
            return None

        def find(self, _query, _projection):
            return FakeCursor([legacy_member])

        async def update_one(self, query, update):
            self.updated.append((query, update))

    users = FakeUsersCollection()
    server_module.db.users = users

    patron = asyncio.run(server_module.find_patron_by_code("ALI4567"))

    assert patron["member_code"] == "ali4567"
    assert users.updated[0][1] == {"$set": {"member_code": "ali4567"}}


def test_login_finds_preserved_email_case_insensitively(server_module):
    user = {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "email": "Alice.Example@Example.COM",
        "password_hash": "hashed-password",
        "name": "Alice",
        "role": "seller",
    }
    queries = []

    class FakeUsersCollection:
        async def find_one(self, query):
            queries.append(query)
            if query == {"normalized_email": "alice.example@example.com"}:
                return user
            return None

    server_module.db.users = FakeUsersCollection()
    server_module.verify_password = lambda password, _password_hash: password == "test-password"

    response = asyncio.run(
        server_module.login(
            server_module.UserLogin(
                identifier="ALICE.EXAMPLE@EXAMPLE.COM",
                password="test-password",
            )
        )
    )

    assert response["email"] == "Alice.Example@Example.COM"
    assert {"normalized_email": "alice.example@example.com"} in queries


def test_group_push_targets_all_privileged_user_subscriptions(server_module):
    users = [
        {"_id": "treasurer-1"},
        {"_id": "admin-1"},
    ]

    class FakeCollection:
        def __init__(self, results):
            self.results = results
            self.query = None

        def find(self, query, *_args):
            self.query = query
            return FakeCursor(self.results)

    user_collection = FakeCollection(users)
    subscriptions = [
        {"_id": "subscription-1", "subscription": {"endpoint": "https://push.example/1"}},
        {"_id": "subscription-2", "subscription": {"endpoint": "https://push.example/2"}},
    ]
    subscription_collection = FakeCollection(subscriptions)
    server_module.db.users = user_collection
    server_module.db.notifications = SimpleNamespace(insert_many=AsyncMock())
    server_module.db.push_subscriptions = subscription_collection
    server_module.VAPID_PUBLIC_KEY = "test-public-key"
    server_module.VAPID_PRIVATE_KEY = "test-private-key"
    server_module.firebase_app = None

    with (
        patch.object(server_module, "webpush") as webpush,
        patch.object(
            server_module.anyio.to_thread,
            "run_sync",
            new=AsyncMock(side_effect=lambda callback: callback()),
        ),
    ):
        asyncio.run(
            server_module.send_push_to_roles(
                ["admin", "super_admin", "treasurer"],
                {"type": "new_deposit", "title": "Deposit received"},
            )
        )

    assert user_collection.query == {
        "role": {"$in": ["admin", "super_admin", "treasurer"]}
    }
    assert subscription_collection.query == {
        "user_id": {"$in": ["treasurer-1", "admin-1"]}
    }
    assert webpush.call_count == 2
