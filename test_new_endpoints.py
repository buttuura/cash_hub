#!/usr/bin/env python3
"""
Test script for 3 NEW backend endpoints:
- PATCH /api/products/{id} (sold_out toggle)
- DELETE /api/orders/{id}
- DELETE /api/products/{id}
"""

import requests
import json
import sys

BASE_URL = "http://localhost:8001"
CREDENTIALS = {
    "identifier": "treasurer@savingsgroup.com",
    "password": "Treasurer@123"
}

class EndpointTester:
    def __init__(self):
        self.token = None
        self.product_id = None
        self.order_id = None
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []

    def log_test(self, test_num, description, passed, status_code=None, response_body=None, expected_status=None):
        """Log test result"""
        if passed:
            self.tests_passed += 1
            print(f"✅ Test {test_num}: {description} - PASS (Status: {status_code})")
        else:
            self.tests_failed += 1
            self.failed_tests.append({
                "test_num": test_num,
                "description": description,
                "expected_status": expected_status,
                "actual_status": status_code,
                "response_body": response_body
            })
            print(f"❌ Test {test_num}: {description} - FAIL")
            print(f"   Expected: {expected_status}, Got: {status_code}")
            print(f"   Response: {response_body}")

    def setup_login(self):
        """Login as treasurer and get access token"""
        print("\n=== PRE-SETUP: Login as Treasurer ===")
        try:
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json=CREDENTIALS,
                headers={"Content-Type": "application/json"}
            )
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                print(f"✅ Login successful. Token obtained.")
                return True
            else:
                print(f"❌ Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False

    def setup_create_product(self):
        """Create a test product"""
        print("\n=== PRE-SETUP: Create Test Product ===")
        try:
            # Create product without images using multipart/form-data
            files = {
                'title': (None, 'Test Item DEL'),
                'description': (None, 'x'),
                'price': (None, '12345'),
                'category': (None, 'electronics')
            }
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.post(
                f"{BASE_URL}/api/products",
                files=files,
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                self.product_id = data.get("id")
                print(f"✅ Product created. ID: {self.product_id}")
                return True
            else:
                print(f"❌ Product creation failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Product creation error: {str(e)}")
            return False

    def setup_create_order(self):
        """Create a test order"""
        print("\n=== PRE-SETUP: Create Test Order ===")
        try:
            order_data = {
                "products": [{"id": self.product_id, "title": "Test Item DEL", "price": 12345, "quantity": 1}],
                "productId": self.product_id,
                "productTitle": "Test Item DEL",
                "productPrice": 12345,
                "sellerName": "Buttura Isaiah",
                "buyerName": "Test Buyer",
                "buyerPhone": "0712345678",
                "buyerEmail": "buyer@test.com",
                "note": "test order",
                "total": 12345,
                "status": "pending"
            }
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                f"{BASE_URL}/api/orders",
                json=order_data,
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                self.order_id = data.get("id")
                print(f"✅ Order created. ID: {self.order_id}")
                return True
            else:
                print(f"❌ Order creation failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Order creation error: {str(e)}")
            return False

    def test_1_patch_product_sold_out_true(self):
        """Test 1: PATCH /api/products/{id} with sold_out: true"""
        print("\n=== Test 1: PATCH product sold_out=true ===")
        try:
            response = requests.patch(
                f"{BASE_URL}/api/products/{self.product_id}",
                json={"sold_out": True},
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json"
                }
            )
            
            data = response.json() if response.status_code == 200 else response.text
            
            # Check: 200, has "sold_out": true, has string "id", no "_id"
            passed = (
                response.status_code == 200 and
                isinstance(data, dict) and
                data.get("sold_out") == True and
                "id" in data and
                isinstance(data.get("id"), str) and
                "_id" not in data
            )
            
            self.log_test(1, "PATCH sold_out=true", passed, response.status_code, data, 200)
            return passed
        except Exception as e:
            self.log_test(1, "PATCH sold_out=true", False, None, str(e), 200)
            return False

    def test_2_patch_product_sold_out_false(self):
        """Test 2: PATCH /api/products/{id} with sold_out: false"""
        print("\n=== Test 2: PATCH product sold_out=false ===")
        try:
            response = requests.patch(
                f"{BASE_URL}/api/products/{self.product_id}",
                json={"sold_out": False},
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json"
                }
            )
            
            data = response.json() if response.status_code == 200 else response.text
            
            # Check: 200, has "sold_out": false
            passed = (
                response.status_code == 200 and
                isinstance(data, dict) and
                data.get("sold_out") == False
            )
            
            self.log_test(2, "PATCH sold_out=false", passed, response.status_code, data, 200)
            return passed
        except Exception as e:
            self.log_test(2, "PATCH sold_out=false", False, None, str(e), 200)
            return False

    def test_3_patch_product_empty_body(self):
        """Test 3: PATCH /api/products/{id} with empty body"""
        print("\n=== Test 3: PATCH product with empty body ===")
        try:
            response = requests.patch(
                f"{BASE_URL}/api/products/{self.product_id}",
                json={},
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json"
                }
            )
            
            data = response.json() if response.content else response.text
            
            # Check: 400, message contains "No valid fields to update"
            passed = (
                response.status_code == 400 and
                isinstance(data, dict) and
                "No valid fields to update" in data.get("detail", "")
            )
            
            self.log_test(3, "PATCH empty body → 400", passed, response.status_code, data, 400)
            return passed
        except Exception as e:
            self.log_test(3, "PATCH empty body → 400", False, None, str(e), 400)
            return False

    def test_4_patch_product_invalid_field(self):
        """Test 4: PATCH /api/products/{id} with invalid field"""
        print("\n=== Test 4: PATCH product with hacker_field ===")
        try:
            response = requests.patch(
                f"{BASE_URL}/api/products/{self.product_id}",
                json={"hacker_field": "evil"},
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json"
                }
            )
            
            data = response.json() if response.content else response.text
            
            # Check: 400 (whitelist rejects all fields)
            passed = response.status_code == 400
            
            self.log_test(4, "PATCH invalid field → 400", passed, response.status_code, data, 400)
            return passed
        except Exception as e:
            self.log_test(4, "PATCH invalid field → 400", False, None, str(e), 400)
            return False

    def test_5_patch_product_invalid_id(self):
        """Test 5: PATCH /api/products/INVALIDID"""
        print("\n=== Test 5: PATCH product with invalid ID ===")
        try:
            response = requests.patch(
                f"{BASE_URL}/api/products/INVALIDID",
                json={"sold_out": True},
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json"
                }
            )
            
            data = response.json() if response.content else response.text
            
            # Check: 400, message contains "Invalid product id"
            passed = (
                response.status_code == 400 and
                isinstance(data, dict) and
                "Invalid product id" in data.get("detail", "")
            )
            
            self.log_test(5, "PATCH invalid ID → 400", passed, response.status_code, data, 400)
            return passed
        except Exception as e:
            self.log_test(5, "PATCH invalid ID → 400", False, None, str(e), 400)
            return False

    def test_6_delete_order(self):
        """Test 6: DELETE /api/orders/{id}"""
        print("\n=== Test 6: DELETE order ===")
        try:
            response = requests.delete(
                f"{BASE_URL}/api/orders/{self.order_id}",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            data = response.json() if response.status_code == 200 else response.text
            
            # Check: 200, has "message": "Order deleted", has "id"
            passed = (
                response.status_code == 200 and
                isinstance(data, dict) and
                data.get("message") == "Order deleted" and
                "id" in data
            )
            
            self.log_test(6, "DELETE order → 200", passed, response.status_code, data, 200)
            return passed
        except Exception as e:
            self.log_test(6, "DELETE order → 200", False, None, str(e), 200)
            return False

    def test_7_get_orders_verify_deleted(self):
        """Test 7: GET /api/orders - verify order is deleted"""
        print("\n=== Test 7: GET orders - verify deletion ===")
        try:
            response = requests.get(
                f"{BASE_URL}/api/orders",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            data = response.json() if response.status_code == 200 else response.text
            
            # Check: 200, order_id NOT in list
            passed = False
            if response.status_code == 200 and isinstance(data, list):
                order_ids = [order.get("id") for order in data]
                passed = self.order_id not in order_ids
            
            self.log_test(7, "GET orders - order deleted", passed, response.status_code, 
                         f"Order {self.order_id} {'not found' if passed else 'still exists'} in list", 200)
            return passed
        except Exception as e:
            self.log_test(7, "GET orders - order deleted", False, None, str(e), 200)
            return False

    def test_8_delete_order_already_deleted(self):
        """Test 8: DELETE /api/orders/{id} (already deleted)"""
        print("\n=== Test 8: DELETE already deleted order ===")
        try:
            response = requests.delete(
                f"{BASE_URL}/api/orders/{self.order_id}",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            data = response.json() if response.content else response.text
            
            # Check: 404, message contains "Order not found"
            passed = (
                response.status_code == 404 and
                isinstance(data, dict) and
                "Order not found" in data.get("detail", "")
            )
            
            self.log_test(8, "DELETE deleted order → 404", passed, response.status_code, data, 404)
            return passed
        except Exception as e:
            self.log_test(8, "DELETE deleted order → 404", False, None, str(e), 404)
            return False

    def test_9_delete_order_invalid_id(self):
        """Test 9: DELETE /api/orders/INVALIDID"""
        print("\n=== Test 9: DELETE order with invalid ID ===")
        try:
            response = requests.delete(
                f"{BASE_URL}/api/orders/INVALIDID",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            data = response.json() if response.content else response.text
            
            # Check: 400
            passed = response.status_code == 400
            
            self.log_test(9, "DELETE order invalid ID → 400", passed, response.status_code, data, 400)
            return passed
        except Exception as e:
            self.log_test(9, "DELETE order invalid ID → 400", False, None, str(e), 400)
            return False

    def test_10_delete_order_without_auth(self):
        """Test 10: DELETE /api/orders/{id} without auth"""
        print("\n=== Test 10: DELETE order without auth ===")
        # First create a fresh order
        try:
            order_data = {
                "products": [{"id": self.product_id, "title": "Test Item DEL", "price": 12345, "quantity": 1}],
                "productId": self.product_id,
                "productTitle": "Test Item DEL",
                "productPrice": 12345,
                "sellerName": "Buttura Isaiah",
                "buyerName": "Test Buyer 2",
                "buyerPhone": "0712345679",
                "buyerEmail": "buyer2@test.com",
                "note": "test order 2",
                "total": 12345,
                "status": "pending"
            }
            
            create_response = requests.post(
                f"{BASE_URL}/api/orders",
                json=order_data,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json"
                }
            )
            
            if create_response.status_code != 200:
                self.log_test(10, "DELETE order without auth", False, None, 
                             "Failed to create test order", 401)
                return False
            
            fresh_order_id = create_response.json().get("id")
            
            # Now try to delete without auth
            response = requests.delete(f"{BASE_URL}/api/orders/{fresh_order_id}")
            
            data = response.json() if response.content else response.text
            
            # Check: 401
            passed = response.status_code == 401
            
            self.log_test(10, "DELETE order without auth → 401", passed, response.status_code, data, 401)
            return passed
        except Exception as e:
            self.log_test(10, "DELETE order without auth → 401", False, None, str(e), 401)
            return False

    def test_11_delete_product(self):
        """Test 11: DELETE /api/products/{id}"""
        print("\n=== Test 11: DELETE product ===")
        try:
            response = requests.delete(
                f"{BASE_URL}/api/products/{self.product_id}",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            data = response.json() if response.status_code == 200 else response.text
            
            # Check: 200
            passed = response.status_code == 200
            
            self.log_test(11, "DELETE product → 200", passed, response.status_code, data, 200)
            return passed
        except Exception as e:
            self.log_test(11, "DELETE product → 200", False, None, str(e), 200)
            return False

    def test_12_get_products_verify_deleted(self):
        """Test 12: GET /api/products - verify product is deleted"""
        print("\n=== Test 12: GET products - verify deletion ===")
        try:
            response = requests.get(f"{BASE_URL}/api/products")
            
            data = response.json() if response.status_code == 200 else response.text
            
            # Check: 200, product_id NOT in list
            passed = False
            if response.status_code == 200 and isinstance(data, list):
                product_ids = [product.get("id") for product in data]
                passed = self.product_id not in product_ids
            
            self.log_test(12, "GET products - product deleted", passed, response.status_code,
                         f"Product {self.product_id} {'not found' if passed else 'still exists'} in list", 200)
            return passed
        except Exception as e:
            self.log_test(12, "GET products - product deleted", False, None, str(e), 200)
            return False

    def test_13_delete_product_already_deleted(self):
        """Test 13: DELETE /api/products/{id} (already deleted)"""
        print("\n=== Test 13: DELETE already deleted product ===")
        try:
            response = requests.delete(
                f"{BASE_URL}/api/products/{self.product_id}",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            data = response.json() if response.content else response.text
            
            # Check: 404
            passed = response.status_code == 404
            
            self.log_test(13, "DELETE deleted product → 404", passed, response.status_code, data, 404)
            return passed
        except Exception as e:
            self.log_test(13, "DELETE deleted product → 404", False, None, str(e), 404)
            return False

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("=" * 70)
        print("🚀 Testing 3 NEW Backend Endpoints")
        print("=" * 70)
        
        # Pre-setup
        if not self.setup_login():
            print("\n❌ FATAL: Login failed. Cannot proceed with tests.")
            return False
        
        if not self.setup_create_product():
            print("\n❌ FATAL: Product creation failed. Cannot proceed with tests.")
            return False
        
        if not self.setup_create_order():
            print("\n❌ FATAL: Order creation failed. Cannot proceed with tests.")
            return False
        
        print("\n" + "=" * 70)
        print("🧪 Running Tests")
        print("=" * 70)
        
        # Run all 13 tests
        self.test_1_patch_product_sold_out_true()
        self.test_2_patch_product_sold_out_false()
        self.test_3_patch_product_empty_body()
        self.test_4_patch_product_invalid_field()
        self.test_5_patch_product_invalid_id()
        self.test_6_delete_order()
        self.test_7_get_orders_verify_deleted()
        self.test_8_delete_order_already_deleted()
        self.test_9_delete_order_invalid_id()
        self.test_10_delete_order_without_auth()
        self.test_11_delete_product()
        self.test_12_get_products_verify_deleted()
        self.test_13_delete_product_already_deleted()
        
        # Print summary
        print("\n" + "=" * 70)
        print("📊 TEST SUMMARY")
        print("=" * 70)
        print(f"Total Tests: {self.tests_passed + self.tests_failed}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in self.failed_tests:
                print(f"\n  Test {test['test_num']}: {test['description']}")
                print(f"    Expected: {test['expected_status']}")
                print(f"    Got: {test['actual_status']}")
                print(f"    Response: {test['response_body']}")
        else:
            print("\n🎉 ALL TESTS PASSED!")
        
        print("=" * 70)
        
        return self.tests_failed == 0

if __name__ == "__main__":
    tester = EndpointTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)
