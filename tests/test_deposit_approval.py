import asyncio
import importlib
import os
import sys
from unittest.mock import Mock, patch

import pytest
from bson import ObjectId


os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "cash_hub_test")
os.environ.setdefault("JWT_SECRET", "test-secret")


class FakeCursor:
    def __init__(self, items):
        self.items = items

    async def to_list(self, *_args, **_kwargs):
        return self.items


class FakeDatabase:
    def __init__(self):
        self.notification_documents = []

    async def insert_many(self, documents):
        self.notification_documents.extend(documents)
        return Mock(inserted_ids=[])

    def __getitem__(self, key):
        return self


class FakeMongoClient:
    def __init__(self, *args, **kwargs):
        self.db = FakeDatabase()

    def __getitem__(self, key):
        return self.db


@pytest.fixture
def server_module():
    sys.modules.pop("backend.server", None)
    with patch("motor.motor_asyncio.AsyncIOMotorClient", return_value=FakeMongoClient()):
        module = importlib.import_module("backend.server")
        module.db.notifications = module.db
        module.firebase_app = None
        yield module


def test_push_events_are_persisted_for_each_recipient(server_module):
    server_module.VAPID_PUBLIC_KEY = None
    server_module.VAPID_PRIVATE_KEY = None
    server_module.firebase_app = None

    asyncio.run(server_module.send_push_to_users(
        ["member-1", "member-2"],
        {
            "id": "order-123",
            "type": "new_order",
            "title": "New order received",
            "body": "New order from a buyer",
        },
    ))

    stored = server_module.db.notification_documents
    assert [notification["user_id"] for notification in stored] == ["member-1", "member-2"]
    assert all(notification["event_id"] == "order-123" for notification in stored)
    assert all(notification["type"] == "new_order" for notification in stored)


def test_approving_savings_deposit_applies_late_fee_then_development_fee(server_module):
    member = {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "id": "507f1f77bcf86cd799439011",
        "name": "Jane",
        "total_savings": 0,
        "development_fund": 0,
        "max_guarantees": 1,
        "membership_type": "ordinary",
    }
    deposit = {
        "_id": ObjectId("607f1f77bcf86cd799439012"),
        "id": "607f1f77bcf86cd799439012",
        "user_id": "507f1f77bcf86cd799439011",
        "amount": 10000,
        "deposit_type": "savings",
        "late_fee": 3000,
        "deduct_late_fee": True,
        "status": "pending",
        "month": "2026-07",
    }

    class FakeDepositsCollection:
        def __init__(self, deposit):
            self.deposit = deposit

        def find(self, query):
            return FakeCursor([])

        async def find_one(self, query):
            return self.deposit

        async def update_one(self, query, update):
            self.deposit.update(update.get("$set", {}))
            return Mock()

    class FakeUsersCollection:
        def __init__(self, member):
            self.member = member

        async def find_one(self, query):
            return self.member

        async def update_one(self, query, update):
            if "$inc" in update:
                for field, value in update["$inc"].items():
                    self.member[field] = self.member.get(field, 0) + value
            if "$set" in update:
                for field, value in update["$set"].items():
                    self.member[field] = value
            return Mock()

    class FakeLoansCollection:
        def find(self, query):
            return FakeCursor([])

    server_module.db.deposits = FakeDepositsCollection(deposit)
    server_module.db.users = FakeUsersCollection(member)
    server_module.db.loans = FakeLoansCollection()
    server_module.ObjectId = lambda value: value

    approval = server_module.TransactionApproval(transaction_id="607f1f77bcf86cd799439012", approved=True, deduct_late_fee=True)

    response = asyncio.run(server_module.approve_deposit(approval, user={"id": "admin-1"}))

    assert response["message"] == "Deposit approved"
    assert member["development_fund"] == 3000
    assert member["total_savings"] == 4000


def test_treasurer_savings_deposit_skips_development_fee(server_module):
    treasurer = {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "id": "507f1f77bcf86cd799439011",
        "name": "Treasurer",
        "total_savings": 0,
        "development_fund": 0,
        "max_guarantees": 1,
        "membership_type": "ordinary",
        "role": "treasurer",
    }
    deposit = {
        "_id": ObjectId("607f1f77bcf86cd799439012"),
        "id": "607f1f77bcf86cd799439012",
        "user_id": "507f1f77bcf86cd799439011",
        "amount": 10000,
        "deposit_type": "savings",
        "late_fee": 0,
        "deduct_late_fee": False,
        "status": "pending",
        "month": "2026-07",
    }

    class FakeDepositsCollection:
        def __init__(self, deposit):
            self.deposit = deposit

        def find(self, query):
            return FakeCursor([])

        async def find_one(self, query):
            return self.deposit

        async def update_one(self, query, update):
            self.deposit.update(update.get("$set", {}))
            return Mock()

    class FakeUsersCollection:
        def __init__(self, member):
            self.member = member

        async def find_one(self, query):
            return self.member

        async def update_one(self, query, update):
            if "$inc" in update:
                for field, value in update["$inc"].items():
                    self.member[field] = self.member.get(field, 0) + value
            if "$set" in update:
                for field, value in update["$set"].items():
                    self.member[field] = value
            return Mock()

    class FakeLoansCollection:
        def find(self, query):
            return FakeCursor([])

    server_module.db.deposits = FakeDepositsCollection(deposit)
    server_module.db.users = FakeUsersCollection(treasurer)
    server_module.db.loans = FakeLoansCollection()
    server_module.ObjectId = lambda value: value

    approval = server_module.TransactionApproval(transaction_id="607f1f77bcf86cd799439012", approved=True, deduct_late_fee=False)

    response = asyncio.run(server_module.approve_deposit(approval, user={"id": "admin-1"}))

    assert response["message"] == "Deposit approved"
    assert treasurer["development_fund"] == 0
    assert treasurer["total_savings"] == 10000


def test_treasurer_development_fee_deposit_goes_directly_to_fund(server_module):
    treasurer = {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "id": "507f1f77bcf86cd799439011",
        "name": "Treasurer",
        "total_savings": 0,
        "development_fund": 0,
        "max_guarantees": 1,
        "membership_type": "ordinary",
        "role": "treasurer",
    }
    deposit = {
        "_id": ObjectId("607f1f77bcf86cd799439012"),
        "id": "607f1f77bcf86cd799439012",
        "user_id": "507f1f77bcf86cd799439011",
        "amount": 3000,
        "deposit_type": "development_fee",
        "late_fee": 0,
        "deduct_late_fee": False,
        "status": "pending",
        "month": "2026-07",
    }

    class FakeDepositsCollection:
        def __init__(self, deposit):
            self.deposit = deposit

        def find(self, query):
            return FakeCursor([])

        async def find_one(self, query):
            return self.deposit

        async def update_one(self, query, update):
            self.deposit.update(update.get("$set", {}))
            return Mock()

    class FakeUsersCollection:
        def __init__(self, member):
            self.member = member

        async def find_one(self, query):
            return self.member

        async def update_one(self, query, update):
            if "$inc" in update:
                for field, value in update["$inc"].items():
                    self.member[field] = self.member.get(field, 0) + value
            if "$set" in update:
                for field, value in update["$set"].items():
                    self.member[field] = value
            return Mock()

    class FakeLoansCollection:
        def find(self, query):
            return FakeCursor([])

    server_module.db.deposits = FakeDepositsCollection(deposit)
    server_module.db.users = FakeUsersCollection(treasurer)
    server_module.db.loans = FakeLoansCollection()
    server_module.ObjectId = lambda value: value

    approval = server_module.TransactionApproval(transaction_id="607f1f77bcf86cd799439012", approved=True, deduct_late_fee=False)

    response = asyncio.run(server_module.approve_deposit(approval, user={"id": "admin-1"}))

    assert response["message"] == "Deposit approved"
    assert treasurer["development_fund"] == 3000
    assert treasurer["total_savings"] == 0
