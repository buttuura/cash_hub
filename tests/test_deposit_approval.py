import asyncio
import importlib
import os
import sys
from unittest.mock import AsyncMock, Mock, patch

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

    def find(self, *_args, **_kwargs):
        return FakeCursor([])

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
        module.db.users = module.db
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


def test_treasurer_deposit_for_member_is_approved_and_credited_immediately(server_module):
    member_id = ObjectId("507f1f77bcf86cd799439011")
    deposit_id = ObjectId("607f1f77bcf86cd799439012")
    member = {
        "_id": member_id,
        "name": "Jane",
        "total_savings": 0,
        "development_fund": 0,
        "max_guarantees": 1,
        "membership_type": "ordinary",
    }

    class FakeDepositsCollection:
        def __init__(self):
            self.deposit = None

        def find(self, _query):
            return FakeCursor([])

        async def insert_one(self, document):
            self.deposit = {**document, "_id": deposit_id}
            return Mock(inserted_id=deposit_id)

        async def find_one(self, _query):
            return self.deposit

        async def update_one(self, _query, update):
            self.deposit.update(update.get("$set", {}))
            return Mock()

    class FakeUsersCollection:
        async def find_one(self, _query):
            return member

        async def update_one(self, _query, update):
            for field, value in update.get("$inc", {}).items():
                member[field] = member.get(field, 0) + value
            member.update(update.get("$set", {}))
            return Mock()

    class FakeLoansCollection:
        def find(self, _query):
            return FakeCursor([])

    deposits = FakeDepositsCollection()
    server_module.db.deposits = deposits
    server_module.db.users = FakeUsersCollection()
    server_module.db.loans = FakeLoansCollection()

    with (
        patch.object(server_module.manager, "broadcast_to_seller", new=AsyncMock()) as broadcast,
        patch.object(server_module, "send_push_to_roles", new=AsyncMock()) as role_push,
        patch.object(server_module, "send_push_to_users", new=AsyncMock()) as user_push,
    ):
        response = asyncio.run(server_module.request_deposit(
            server_module.DepositRequest(
                amount=10000,
                target_user_id=str(member_id),
            ),
            user={"id": "treasurer-1", "role": "treasurer"},
        ))

    assert response["id"] == str(deposit_id)
    assert response["status"] == "approved"
    assert response["approved_by"] == "treasurer-1"
    assert member["development_fund"] == 3000
    assert member["total_savings"] == 7000
    broadcast.assert_not_awaited()
    role_push.assert_not_awaited()
    user_push.assert_awaited_once()


def test_member_can_submit_development_fee_deposit(server_module):
    deposit_id = ObjectId("607f1f77bcf86cd799439013")

    class FakeDepositsCollection:
        def __init__(self):
            self.deposit = None

        async def insert_one(self, document):
            self.deposit = {**document, "_id": deposit_id}
            return Mock(inserted_id=deposit_id)

    deposits = FakeDepositsCollection()
    server_module.db.deposits = deposits
    user = {
        "id": "507f1f77bcf86cd799439011",
        "name": "Jane",
        "email": "jane@example.com",
        "role": "member",
    }

    with (
        patch.object(server_module.manager, "broadcast_to_seller", new=AsyncMock()) as broadcast,
        patch.object(server_module, "send_push_to_roles", new=AsyncMock()) as role_push,
        patch.object(server_module, "send_push_to_users", new=AsyncMock()) as user_push,
    ):
        response = asyncio.run(server_module.request_deposit(
            server_module.DepositRequest(amount=3000, deposit_type="development_fee"),
            user=user,
        ))

    assert response["id"] == str(deposit_id)
    assert response["deposit_type"] == "development_fee"
    assert response["amount"] == 3000
    assert response["status"] == "pending"
    assert deposits.deposit["user_id"] == user["id"]
    broadcast.assert_not_awaited()
    role_push.assert_awaited_once()
    assert role_push.await_args.args[0] == ["admin", "super_admin", "treasurer"]
    user_push.assert_awaited_once()
    assert user_push.await_args.args[0] == [user["id"]]


def test_full_withdrawal_starts_60_day_notice_and_notifies_treasurer(server_module):
    user_id = "507f1f77bcf86cd799439011"

    class FakeUsersCollection:
        async def find_one(self, _query):
            return {"total_savings": 80000, "development_fund": 6000}

    class FakeWithdrawalsCollection:
        def __init__(self):
            self.documents = []

        async def find_one(self, _query):
            return None

        async def insert_one(self, document):
            self.documents.append(document.copy())
            return Mock(inserted_id=ObjectId("607f1f77bcf86cd799439014"))

    server_module.db.users = FakeUsersCollection()
    server_module.db.loans = Mock()
    server_module.db.loans.find_one = AsyncMock(return_value=None)
    withdrawals = FakeWithdrawalsCollection()
    server_module.db.withdrawals = withdrawals

    with (
        patch.object(server_module.manager, "broadcast_to_seller", new=AsyncMock()) as broadcast,
        patch.object(server_module, "send_push_to_roles", new=AsyncMock()) as role_push,
        patch.object(server_module, "send_push_to_users", new=AsyncMock()) as user_push,
    ):
        response = asyncio.run(server_module.request_withdrawal(
            server_module.WithdrawalRequest(
                amount=86000,
                withdrawal_type="leaving_group",
                reason="Leaving the group",
            ),
            user={"id": user_id, "name": "Jane", "role": "member"},
        ))

    created_at = server_module.datetime.fromisoformat(response["created_at"])
    approval_available_at = server_module.datetime.fromisoformat(response["approval_available_at"])
    assert response["status"] == "waiting_period"
    assert (approval_available_at - created_at).days == 60
    assert withdrawals.documents[0]["savings_amount"] == 80000
    assert withdrawals.documents[0]["development_fund_amount"] == 6000
    broadcast.assert_not_awaited()
    role_push.assert_awaited_once()
    roles, notification = role_push.await_args.args
    assert roles == ["treasurer"]
    assert notification["title"] == "Full withdrawal notice started"
    assert "Jane started a 60-day notice" in notification["body"]
    assert "UGX 86,000" in notification["body"]
    user_push.assert_awaited_once()


def test_full_withdrawal_requires_entire_savings_and_development_balance(server_module):
    class FakeUsersCollection:
        async def find_one(self, _query):
            return {"total_savings": 80000, "development_fund": 6000}

    class FakeWithdrawalsCollection:
        async def find_one(self, _query):
            return None

    server_module.db.users = FakeUsersCollection()
    server_module.db.loans = Mock()
    server_module.db.loans.find_one = AsyncMock(return_value=None)
    server_module.db.withdrawals = FakeWithdrawalsCollection()

    with pytest.raises(server_module.HTTPException) as error:
        asyncio.run(server_module.request_withdrawal(
            server_module.WithdrawalRequest(
                amount=80000,
                withdrawal_type="leaving_group",
            ),
            user={"id": "507f1f77bcf86cd799439011", "name": "Jane"},
        ))

    assert error.value.status_code == 400
    assert "full balance" in error.value.detail


def test_matured_full_withdrawal_is_sent_to_admin_queue(server_module):
    now = server_module.datetime.now(server_module.timezone.utc)
    withdrawal = {
        "_id": ObjectId("607f1f77bcf86cd799439015"),
        "user_id": "507f1f77bcf86cd799439011",
        "user_name": "Jane",
        "amount": 86000,
        "status": "waiting_period",
        "approval_available_at": (now - server_module.timedelta(seconds=1)).isoformat(),
    }

    class FakeWithdrawalsCollection:
        def find(self, query):
            assert query["status"] == "waiting_period"
            return FakeCursor([withdrawal])

        async def update_one(self, query, update):
            assert query["status"] == "waiting_period"
            withdrawal.update(update["$set"])
            return Mock(modified_count=1)

    server_module.db.withdrawals = FakeWithdrawalsCollection()

    with (
        patch.object(server_module.manager, "broadcast_to_seller", new=AsyncMock()) as broadcast,
        patch.object(server_module, "send_push_to_roles", new=AsyncMock()) as role_push,
        patch.object(server_module, "send_push_to_users", new=AsyncMock()) as user_push,
    ):
        asyncio.run(server_module.activate_matured_full_withdrawals())

    assert withdrawal["status"] == "pending"
    assert "notice_period_completed_at" in withdrawal
    broadcast.assert_not_awaited()
    role_push.assert_awaited_once()
    user_push.assert_awaited_once()


def test_approving_full_withdrawal_deducts_notice_balance_split(server_module):
    withdrawal_id = ObjectId("607f1f77bcf86cd799439016")
    member_id = ObjectId("507f1f77bcf86cd799439011")
    withdrawal = {
        "_id": withdrawal_id,
        "user_id": str(member_id),
        "amount": 86000,
        "withdrawal_type": "leaving_group",
        "savings_amount": 80000,
        "development_fund_amount": 6000,
        "status": "pending",
        "approval_available_at": (
            server_module.datetime.now(server_module.timezone.utc) - server_module.timedelta(days=1)
        ).isoformat(),
    }
    member = {"total_savings": 120000, "development_fund": 10000}

    class FakeWithdrawalsCollection:
        async def find_one(self, _query):
            return withdrawal

        async def update_one(self, _query, update):
            withdrawal.update(update.get("$set", {}))
            return Mock()

    class FakeUsersCollection:
        async def find_one(self, _query):
            return member

        async def update_one(self, _query, update):
            for field, value in update.get("$inc", {}).items():
                member[field] = member.get(field, 0) + value
            return Mock()

    server_module.db.withdrawals = FakeWithdrawalsCollection()
    server_module.db.users = FakeUsersCollection()
    server_module.db.loans = Mock()
    server_module.db.loans.find_one = AsyncMock(return_value=None)

    with patch.object(server_module, "send_push_to_users", new=AsyncMock()):
        result = asyncio.run(server_module.approve_withdrawal(
            server_module.TransactionApproval(
                transaction_id=str(withdrawal_id),
                approved=True,
            ),
            user={"id": "admin-1"},
        ))

    assert result["message"] == "Withdrawal approved"
    assert member["total_savings"] == 40000
    assert member["development_fund"] == 4000
    assert withdrawal["status"] == "approved"
