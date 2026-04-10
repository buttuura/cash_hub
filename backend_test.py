import requests
import sys
import json
from datetime import datetime

class GroupCashManagementTester:
    def __init__(self, base_url="https://group-cash-hub.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.admin_token = None
        self.super_admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_user_id = None
        self.admin_user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json() if response.content else {}
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text}")

            return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def get_auth_headers(self, token=None):
        """Get authorization headers"""
        if token:
            return {'Authorization': f'Bearer {token}'}
        return {}

    def test_super_admin_login(self):
        """Test super admin login"""
        success, response = self.run_test(
            "Super Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "superadmin@savingsgroup.com", "password": "SuperAdmin@123"}
        )
        if success and 'access_token' in response:
            self.super_admin_token = response['access_token']
            print(f"   Super Admin ID: {response.get('id')}")
            return True
        return False

    def test_user_registration(self):
        """Test user registration"""
        test_email = f"testuser_{datetime.now().strftime('%H%M%S')}@test.com"
        success, response = self.run_test(
            "User Registration",
            "POST",
            "api/auth/register",
            200,
            data={
                "name": "Test User",
                "email": test_email,
                "password": "TestPass123!",
                "phone": "+256700000000"
            }
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.test_user_id = response.get('id')
            print(f"   Test User ID: {self.test_user_id}")
            return True
        return False

    def test_get_current_user(self):
        """Test get current user endpoint"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "api/auth/me",
            200,
            headers=self.get_auth_headers(self.token)
        )
        return success

    def test_group_stats(self):
        """Test group statistics endpoint"""
        success, response = self.run_test(
            "Get Group Stats",
            "GET",
            "api/stats/group",
            200,
            headers=self.get_auth_headers(self.token)
        )
        if success:
            print(f"   Total Members: {response.get('total_members', 0)}")
            print(f"   Total Balance: UGX {response.get('total_group_balance', 0):,}")
        return success

    def test_get_members(self):
        """Test get all members"""
        success, response = self.run_test(
            "Get All Members",
            "GET",
            "api/members",
            200,
            headers=self.get_auth_headers(self.token)
        )
        if success:
            print(f"   Found {len(response)} members")
        return success

    def test_deposit_request(self):
        """Test deposit request"""
        success, response = self.run_test(
            "Create Deposit Request",
            "POST",
            "api/deposits/request",
            200,
            data={"amount": 55000, "description": "Monthly contribution"},
            headers=self.get_auth_headers(self.token)
        )
        if success:
            self.deposit_id = response.get('id')
            print(f"   Deposit ID: {self.deposit_id}")
        return success

    def test_get_deposits(self):
        """Test get deposits"""
        success, response = self.run_test(
            "Get Deposits",
            "GET",
            "api/deposits",
            200,
            headers=self.get_auth_headers(self.token)
        )
        if success:
            print(f"   Found {len(response)} deposits")
        return success

    def test_loan_request_non_premium(self):
        """Test loan request for non-premium member (should fail)"""
        success, response = self.run_test(
            "Loan Request (Non-Premium - Should Fail)",
            "POST",
            "api/loans/request",
            403,  # Should fail for non-premium members
            data={"amount": 100000, "reason": "Emergency"},
            headers=self.get_auth_headers(self.token)
        )
        return success

    def test_withdrawal_request_insufficient_funds(self):
        """Test withdrawal request with insufficient funds (should fail)"""
        success, response = self.run_test(
            "Withdrawal Request (Insufficient Funds - Should Fail)",
            "POST",
            "api/withdrawals/request",
            400,  # Should fail due to insufficient funds
            data={"amount": 100000, "reason": "Emergency withdrawal"},
            headers=self.get_auth_headers(self.token)
        )
        return success

    def test_admin_get_pending_deposits(self):
        """Test admin getting pending deposits"""
        success, response = self.run_test(
            "Get Pending Deposits (Admin)",
            "GET",
            "api/deposits/pending",
            200,
            headers=self.get_auth_headers(self.super_admin_token)
        )
        if success:
            print(f"   Found {len(response)} pending deposits")
        return success

    def test_admin_approve_deposit(self):
        """Test admin approving a deposit"""
        if hasattr(self, 'deposit_id') and self.deposit_id:
            success, response = self.run_test(
                "Approve Deposit (Admin)",
                "POST",
                "api/deposits/approve",
                200,
                data={"transaction_id": self.deposit_id, "approved": True, "notes": "Approved by admin"},
                headers=self.get_auth_headers(self.super_admin_token)
            )
            return success
        else:
            print("❌ No deposit ID available for approval test")
            return False

    def test_super_admin_set_membership_premium(self):
        """Test super admin setting user to premium membership"""
        if self.test_user_id:
            success, response = self.run_test(
                "Set User to Premium (Super Admin)",
                "POST",
                "api/admin/set-membership",
                200,
                data={"user_id": self.test_user_id, "membership_type": "premium"},
                headers=self.get_auth_headers(self.super_admin_token)
            )
            return success
        return False

    def test_loan_request_premium(self):
        """Test loan request for premium member (should succeed)"""
        success, response = self.run_test(
            "Loan Request (Premium Member)",
            "POST",
            "api/loans/request",
            200,
            data={"amount": 300000, "reason": "Business expansion"},
            headers=self.get_auth_headers(self.token)
        )
        if success:
            self.loan_id = response.get('id')
            print(f"   Loan ID: {self.loan_id}")
        return success

    def test_loan_request_exceeds_limit(self):
        """Test loan request exceeding maximum limit (should fail)"""
        success, response = self.run_test(
            "Loan Request (Exceeds Limit - Should Fail)",
            "POST",
            "api/loans/request",
            400,  # Should fail due to exceeding limit
            data={"amount": 700000, "reason": "Large investment"},
            headers=self.get_auth_headers(self.token)
        )
        return success

    def test_admin_approve_loan(self):
        """Test admin approving a loan"""
        if hasattr(self, 'loan_id') and self.loan_id:
            success, response = self.run_test(
                "Approve Loan (Admin)",
                "POST",
                "api/loans/approve",
                200,
                data={"transaction_id": self.loan_id, "approved": True, "notes": "Approved by admin"},
                headers=self.get_auth_headers(self.super_admin_token)
            )
            return success
        else:
            print("❌ No loan ID available for approval test")
            return False

    def test_withdrawal_request_with_balance(self):
        """Test withdrawal request with sufficient balance"""
        success, response = self.run_test(
            "Withdrawal Request (With Balance)",
            "POST",
            "api/withdrawals/request",
            200,
            data={"amount": 10000, "reason": "Personal expense"},
            headers=self.get_auth_headers(self.token)
        )
        if success:
            self.withdrawal_id = response.get('id')
            print(f"   Withdrawal ID: {self.withdrawal_id}")
        return success

    def test_super_admin_set_role(self):
        """Test super admin setting user role"""
        if self.test_user_id:
            success, response = self.run_test(
                "Set User Role to Admin (Super Admin)",
                "POST",
                "api/admin/set-role",
                200,
                data={"user_id": self.test_user_id, "new_role": "admin"},
                headers=self.get_auth_headers(self.super_admin_token)
            )
            return success
        return False

    def test_unauthorized_access(self):
        """Test unauthorized access to protected endpoints"""
        success, response = self.run_test(
            "Unauthorized Access (Should Fail)",
            "GET",
            "api/deposits/pending",
            401,  # Should fail without auth
        )
        return success

    def test_non_admin_access_admin_endpoint(self):
        """Test non-admin access to admin endpoints"""
        # First set user back to member role
        if self.test_user_id:
            self.run_test(
                "Set User Role to Member",
                "POST",
                "api/admin/set-role",
                200,
                data={"user_id": self.test_user_id, "new_role": "member"},
                headers=self.get_auth_headers(self.super_admin_token)
            )
        
        success, response = self.run_test(
            "Non-Admin Access to Admin Endpoint (Should Fail)",
            "GET",
            "api/deposits/pending",
            403,  # Should fail for non-admin
            headers=self.get_auth_headers(self.token)
        )
        return success

    def test_currency_formatting(self):
        """Test that currency values are properly formatted"""
        success, response = self.run_test(
            "Currency Formatting Check",
            "GET",
            "api/stats/group",
            200,
            headers=self.get_auth_headers(self.super_admin_token)
        )
        if success:
            # Check if numeric values are present (formatting is handled on frontend)
            balance = response.get('total_group_balance', 0)
            if isinstance(balance, (int, float)):
                print(f"   Balance value type: {type(balance).__name__}")
                print(f"   Balance value: {balance}")
                return True
            else:
                print(f"   ❌ Balance is not numeric: {balance}")
                return False
        return False

def main():
    # Setup
    tester = GroupCashManagementTester()
    
    print("🚀 Starting Group Cash Management API Tests")
    print("=" * 50)

    # Test sequence
    tests = [
        # Authentication tests
        ("Super Admin Login", tester.test_super_admin_login),
        ("User Registration", tester.test_user_registration),
        ("Get Current User", tester.test_get_current_user),
        
        # Basic functionality tests
        ("Group Statistics", tester.test_group_stats),
        ("Get Members", tester.test_get_members),
        ("Currency Formatting", tester.test_currency_formatting),
        
        # Transaction tests
        ("Deposit Request", tester.test_deposit_request),
        ("Get Deposits", tester.test_get_deposits),
        ("Loan Request (Non-Premium)", tester.test_loan_request_non_premium),
        ("Withdrawal Request (Insufficient Funds)", tester.test_withdrawal_request_insufficient_funds),
        
        # Admin functionality tests
        ("Get Pending Deposits (Admin)", tester.test_admin_get_pending_deposits),
        ("Approve Deposit (Admin)", tester.test_admin_approve_deposit),
        ("Set Membership to Premium", tester.test_super_admin_set_membership_premium),
        ("Loan Request (Premium)", tester.test_loan_request_premium),
        ("Loan Request (Exceeds Limit)", tester.test_loan_request_exceeds_limit),
        ("Approve Loan (Admin)", tester.test_admin_approve_loan),
        ("Withdrawal Request (With Balance)", tester.test_withdrawal_request_with_balance),
        ("Set User Role", tester.test_super_admin_set_role),
        
        # Security tests
        ("Unauthorized Access", tester.test_unauthorized_access),
        ("Non-Admin Access", tester.test_non_admin_access_admin_endpoint),
    ]

    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} - Exception: {str(e)}")
            failed_tests.append(test_name)

    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if failed_tests:
        print(f"\n❌ Failed Tests ({len(failed_tests)}):")
        for test in failed_tests:
            print(f"   - {test}")
    else:
        print("\n✅ All tests passed!")

    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"\n📈 Success Rate: {success_rate:.1f}%")
    
    return 0 if len(failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())