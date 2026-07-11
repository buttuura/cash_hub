import importlib
import os
import sys
from unittest.mock import Mock, patch, MagicMock

import pytest
from fastapi import HTTPException

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "cash_hub_test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from datetime import datetime, timezone, timedelta


@pytest.fixture
def server_module():
    sys.modules.pop("backend.server", None)
    fake_client = MagicMock()
    with patch("motor.motor_asyncio.AsyncIOMotorClient", return_value=fake_client):
        module = importlib.import_module("backend.server")
        yield module


class TestCalculateLoanInterest:
    def test_month_1_uses_normal_rate(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=0, months_to_accrue=1)
        assert interest == 3000.0

    def test_month_4_still_normal(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=3, months_to_accrue=1)
        assert interest == 3000.0

    def test_month_5_switches_to_extended(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=4, months_to_accrue=1)
        assert interest == 5000.0

    def test_month_6_uses_extended(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=5, months_to_accrue=1)
        assert interest == 5000.0

    def test_catch_up_months_1_through_4(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=0, months_to_accrue=4)
        assert interest == 12000.0

    def test_catch_up_months_5_and_6(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=4, months_to_accrue=2)
        assert interest == 10000.0

    def test_full_six_months_mix(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=0, months_to_accrue=6)
        assert interest == 22000.0

    def test_zero_months_returns_zero(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=5, months_to_accrue=0)
        assert interest == 0.0

    def test_negative_months_returns_zero(self, server_module):
        interest = server_module.calculate_loan_interest(100000, total_months_elapsed=-1, months_to_accrue=1)
        assert interest == 0.0


class TestForgotPassword:
    @pytest.fixture
    def mock_db(self):
        return {
            "users": MagicMock(),
            "password_resets": MagicMock(),
        }

    def test_forgot_password_generates_temp_password(self, server_module, mock_db):
        import asyncio

        async def run_test():
            mock_user = {
                "_id": "user123",
                "normalized_phone": "700000000",
                "phone": "0700000000",
                "name": "Test User",
                "email": None,
            }
            mock_db["users"].find_one.return_value = asyncio.Future()
            mock_db["users"].find_one.return_value.set_result(mock_user)
            server_module.db = MagicMock()
            server_module.db.users = mock_db["users"]
            server_module.db.password_resets = mock_db["password_resets"]
            mock_db["password_resets"].update_one.return_value = asyncio.Future()
            mock_db["password_resets"].update_one.return_value.set_result(None)

            with patch.object(server_module, 'send_whatsapp_message', return_value=True):
                result = await server_module.forgot_password(server_module.ForgotPasswordRequest(phone="0700000000"))
                assert "temporary password has been sent" in result["message"]
                mock_db["password_resets"].update_one.assert_called_once()

        asyncio.run(run_test())

    def test_reset_password_validates_temp_password(self, server_module):
        import asyncio

        async def run_test():
            mock_reset = {
                "_id": "reset123",
                "phone": "700000000",
                "temp_password": server_module.hash_password("123456"),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=3)).isoformat(),
                "used": False,
            }
            mock_user = {
                "_id": "user123",
                "password_hash": server_module.hash_password("oldpassword"),
            }
            server_module.db = MagicMock()
            server_module.db.password_resets = MagicMock()
            reset_future = asyncio.Future()
            reset_future.set_result(mock_reset)
            server_module.db.password_resets.find_one.return_value = reset_future
            server_module.db.users = MagicMock()
            user_future = asyncio.Future()
            user_future.set_result(mock_user)
            server_module.db.users.find_one.return_value = user_future
            update_future = asyncio.Future()
            update_future.set_result(None)
            server_module.db.users.update_one.return_value = update_future
            reset_update_future = asyncio.Future()
            reset_update_future.set_result(None)
            server_module.db.password_resets.update_one.return_value = reset_update_future

            result = await server_module.reset_password(
                server_module.ResetPasswordRequest(
                    phone="0700000000",
                    temp_password="123456",
                    new_password="newpassword123"
                )
            )
            assert result["message"] == "Password reset successfully"
            server_module.db.users.update_one.assert_called_once()

        asyncio.run(run_test())

    def test_reset_password_rejects_expired_code(self, server_module):
        import asyncio

        async def run_test():
            mock_reset = {
                "_id": "reset123",
                "phone": "700000000",
                "temp_password": server_module.hash_password("123456"),
                "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
                "used": False,
            }
            server_module.db = MagicMock()
            server_module.db.password_resets = MagicMock()
            reset_future = asyncio.Future()
            reset_future.set_result(mock_reset)
            server_module.db.password_resets.find_one.return_value = reset_future
            delete_future = asyncio.Future()
            delete_future.set_result(None)
            server_module.db.password_resets.delete_one.return_value = delete_future

            with pytest.raises(HTTPException) as exc_info:
                await server_module.reset_password(
                    server_module.ResetPasswordRequest(
                        phone="0700000000",
                        temp_password="123456",
                        new_password="newpassword123"
                    )
                )
            assert exc_info.value.status_code == 400
            assert "expired" in exc_info.value.detail.lower()

        asyncio.run(run_test())
