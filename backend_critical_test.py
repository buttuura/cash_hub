#!/usr/bin/env python3
"""
Critical Backend Tests for Code Review Fixes
Tests the following endpoints after critical fixes:
1. POST /api/auth/login - Treasurer login
2. GET /api/debug/cloudinary-status - Cloudinary configuration check
3. POST /api/uploads - Cloudinary upload with multipart file
4. GET /api/quick-loans/valid-codes - OFFICERS fix (should not crash)
5. POST /api/quick-loans/request - OFFICERS fix (should return 400, not 500)
6. GET /api/loans - Variable rename fix (l → loan_item)
"""

import requests
import sys
import json
import io
from PIL import Image

class CriticalBackendTester:
    def __init__(self, base_url="https://cdn-integration-test.preview.emergentagent.com"):
        self.base_url = base_url
        self.treasurer_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_test(self, name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ {name}")
            if details:
                print(f"   {details}")
        else:
            self.failed_tests.append(name)
            print(f"❌ {name}")
            if details:
                print(f"   {details}")

    def test_1_treasurer_login(self):
        """Test 1: POST /api/auth/login with treasurer credentials"""
        print("\n🔍 Test 1: Treasurer Login")
        url = f"{self.base_url}/api/auth/login"
        
        try:
            response = requests.post(
                url,
                json={
                    "identifier": "treasurer@savingsgroup.com",
                    "password": "Treasurer@123"
                },
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                data = response.json()
                if 'access_token' in data:
                    self.treasurer_token = data['access_token']
                    self.log_test(
                        "Treasurer Login",
                        True,
                        f"Status: {response.status_code}, Token received, Role: {data.get('role')}"
                    )
                    return True
                else:
                    self.log_test(
                        "Treasurer Login",
                        False,
                        f"Status: {response.status_code}, No access_token in response"
                    )
                    return False
            else:
                self.log_test(
                    "Treasurer Login",
                    False,
                    f"Status: {response.status_code}, Expected: 200, Response: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test("Treasurer Login", False, f"Exception: {str(e)}")
            return False

    def test_2_cloudinary_status(self):
        """Test 2: GET /api/debug/cloudinary-status (auth required)"""
        print("\n🔍 Test 2: Cloudinary Status Check")
        
        if not self.treasurer_token:
            self.log_test("Cloudinary Status", False, "No treasurer token available")
            return False
        
        url = f"{self.base_url}/api/debug/cloudinary-status"
        
        try:
            response = requests.get(
                url,
                headers={'Authorization': f'Bearer {self.treasurer_token}'}
            )
            
            if response.status_code == 200:
                data = response.json()
                cloudinary_configured = data.get('cloudinary_configured', False)
                cloud_name = data.get('cloudinary_cloud_name', '')
                status = data.get('status', '')
                
                if cloudinary_configured and cloud_name == "dwvfohqed" and "OK" in status:
                    self.log_test(
                        "Cloudinary Status",
                        True,
                        f"Configured: {cloudinary_configured}, Cloud: {cloud_name}, Status: {status}"
                    )
                    return True
                else:
                    self.log_test(
                        "Cloudinary Status",
                        False,
                        f"Configured: {cloudinary_configured}, Cloud: {cloud_name}, Status: {status}"
                    )
                    return False
            else:
                self.log_test(
                    "Cloudinary Status",
                    False,
                    f"Status: {response.status_code}, Expected: 200, Response: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test("Cloudinary Status", False, f"Exception: {str(e)}")
            return False

    def test_3_upload_file(self):
        """Test 3: POST /api/uploads (auth required, multipart file upload)"""
        print("\n🔍 Test 3: File Upload to Cloudinary")
        
        if not self.treasurer_token:
            self.log_test("File Upload", False, "No treasurer token available")
            return False
        
        url = f"{self.base_url}/api/uploads"
        
        try:
            # Create a small test image (10x10 red square)
            img = Image.new('RGB', (10, 10), color='red')
            img_bytes = io.BytesIO()
            img.save(img_bytes, format='PNG')
            img_bytes.seek(0)
            
            files = {'file': ('test_image.png', img_bytes, 'image/png')}
            headers = {'Authorization': f'Bearer {self.treasurer_token}'}
            
            response = requests.post(url, files=files, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                url_field = data.get('url', '')
                cloudinary_data = data.get('cloudinary', {})
                public_id = cloudinary_data.get('public_id', '')
                secure_url = cloudinary_data.get('secure_url', '')
                upload_id = data.get('id', '')
                
                # Check if URL points to res.cloudinary.com/dwvfohqed/...
                if 'res.cloudinary.com/dwvfohqed' in url_field and public_id and secure_url and upload_id:
                    self.log_test(
                        "File Upload",
                        True,
                        f"URL: {url_field[:60]}..., Public ID: {public_id}, ID: {upload_id}"
                    )
                    return True
                else:
                    self.log_test(
                        "File Upload",
                        False,
                        f"Missing fields - URL: {url_field[:60]}, Public ID: {public_id}, Secure URL: {secure_url[:60] if secure_url else 'None'}, ID: {upload_id}"
                    )
                    return False
            else:
                self.log_test(
                    "File Upload",
                    False,
                    f"Status: {response.status_code}, Expected: 200, Response: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test("File Upload", False, f"Exception: {str(e)}")
            return False

    def test_4_quick_loans_valid_codes(self):
        """Test 4: GET /api/quick-loans/valid-codes (OFFICERS fix - should not crash)"""
        print("\n🔍 Test 4: Quick Loans Valid Codes (OFFICERS fix)")
        
        url = f"{self.base_url}/api/quick-loans/valid-codes"
        
        try:
            response = requests.get(url)
            
            if response.status_code == 200:
                data = response.json()
                officers = data.get('officers', None)
                members = data.get('members', None)
                all_codes = data.get('all', None)
                
                # Officers should be an empty list (since OFFICERS is empty by default)
                if isinstance(officers, list) and len(officers) == 0 and isinstance(members, list) and isinstance(all_codes, list):
                    self.log_test(
                        "Quick Loans Valid Codes",
                        True,
                        f"Officers: {len(officers)} (empty as expected), Members: {len(members)}, All: {len(all_codes)}"
                    )
                    return True
                else:
                    self.log_test(
                        "Quick Loans Valid Codes",
                        False,
                        f"Unexpected response structure - Officers: {officers}, Members count: {len(members) if isinstance(members, list) else 'Not a list'}"
                    )
                    return False
            else:
                # If it's a 500 error, it means OFFICERS is still undefined (NameError)
                if response.status_code == 500:
                    self.log_test(
                        "Quick Loans Valid Codes",
                        False,
                        f"Status: 500 (CRITICAL: OFFICERS undefined NameError), Response: {response.text[:200]}"
                    )
                else:
                    self.log_test(
                        "Quick Loans Valid Codes",
                        False,
                        f"Status: {response.status_code}, Expected: 200, Response: {response.text[:200]}"
                    )
                return False
                
        except Exception as e:
            self.log_test("Quick Loans Valid Codes", False, f"Exception: {str(e)}")
            return False

    def test_5_quick_loans_request_invalid_officer(self):
        """Test 5: POST /api/quick-loans/request with invalid officer code (should return 400, not 500)"""
        print("\n🔍 Test 5: Quick Loans Request with Invalid Officer Code (OFFICERS fix)")
        
        url = f"{self.base_url}/api/quick-loans/request"
        
        try:
            # Create a small test image for collateral
            img = Image.new('RGB', (10, 10), color='blue')
            img_bytes = io.BytesIO()
            img.save(img_bytes, format='PNG')
            img_bytes.seek(0)
            
            # Submit a guaranteed quick loan request with non-existing officer code
            files = {
                'collateral_image': ('collateral.png', img_bytes, 'image/png')
            }
            data = {
                'loan_name': 'Test Borrower',
                'loan_email': 'testborrower@example.com',
                'loan_phone': '0700123456',
                'amount': '50000',
                'purpose': 'Business loan',
                'collateral': 'Motorcycle',
                'is_guaranteed': 'true',
                'officer_code': 'OFC999',  # Non-existing officer code
                'officer_name': 'Non-existing Officer'
            }
            
            response = requests.post(url, files=files, data=data)
            
            # Should return 400 (Invalid officer or member code), NOT 500 (NameError)
            if response.status_code == 400:
                response_text = response.text
                if 'Invalid officer or member code' in response_text:
                    self.log_test(
                        "Quick Loans Request (Invalid Officer)",
                        True,
                        f"Status: 400 (as expected), Message: Invalid officer or member code"
                    )
                    return True
                else:
                    self.log_test(
                        "Quick Loans Request (Invalid Officer)",
                        False,
                        f"Status: 400 but unexpected message: {response_text[:200]}"
                    )
                    return False
            elif response.status_code == 500:
                self.log_test(
                    "Quick Loans Request (Invalid Officer)",
                    False,
                    f"Status: 500 (CRITICAL: OFFICERS undefined NameError), Response: {response.text[:200]}"
                )
                return False
            else:
                self.log_test(
                    "Quick Loans Request (Invalid Officer)",
                    False,
                    f"Status: {response.status_code}, Expected: 400, Response: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test("Quick Loans Request (Invalid Officer)", False, f"Exception: {str(e)}")
            return False

    def test_6_get_loans(self):
        """Test 6: GET /api/loans (auth required, variable rename fix)"""
        print("\n🔍 Test 6: Get Loans (Variable rename fix: l → loan_item)")
        
        if not self.treasurer_token:
            self.log_test("Get Loans", False, "No treasurer token available")
            return False
        
        url = f"{self.base_url}/api/loans"
        
        try:
            response = requests.get(
                url,
                headers={'Authorization': f'Bearer {self.treasurer_token}'}
            )
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test(
                        "Get Loans",
                        True,
                        f"Status: 200, Loans count: {len(data)}"
                    )
                    return True
                else:
                    self.log_test(
                        "Get Loans",
                        False,
                        f"Status: 200 but response is not a list: {type(data)}"
                    )
                    return False
            else:
                self.log_test(
                    "Get Loans",
                    False,
                    f"Status: {response.status_code}, Expected: 200, Response: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test("Get Loans", False, f"Exception: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all critical tests in sequence"""
        print("=" * 70)
        print("🚀 CRITICAL BACKEND TESTS - CODE REVIEW FIXES")
        print("=" * 70)
        
        # Test sequence (order matters - login first to get token)
        self.test_1_treasurer_login()
        self.test_2_cloudinary_status()
        self.test_3_upload_file()
        self.test_4_quick_loans_valid_codes()
        self.test_5_quick_loans_request_invalid_officer()
        self.test_6_get_loans()
        
        # Print summary
        print("\n" + "=" * 70)
        print(f"📊 TEST SUMMARY: {self.tests_passed}/{self.tests_run} PASSED")
        print("=" * 70)
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS ({len(self.failed_tests)}):")
            for test in self.failed_tests:
                print(f"   - {test}")
        else:
            print("\n✅ ALL CRITICAL TESTS PASSED!")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\n📈 Success Rate: {success_rate:.1f}%")
        
        return len(self.failed_tests) == 0

def main():
    tester = CriticalBackendTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
