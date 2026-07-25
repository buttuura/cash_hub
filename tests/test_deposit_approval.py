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
        yield module


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
