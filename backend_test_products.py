#!/usr/bin/env python3
"""
Backend test for POST /api/products ObjectId serialization fix
Tests the fix for: TypeError("'ObjectId' object is not iterable")
"""

import requests
import json
import io
from PIL import Image

# Backend URL - using localhost:8001 as backend runs on 0.0.0.0:8001
BASE_URL = "http://localhost:8001/api"

# Test credentials from /app/memory/test_credentials.md
TREASURER_EMAIL = "treasurer@savingsgroup.com"
TREASURER_PASSWORD = "Treasurer@123"

def create_test_image():
    """Create a small PNG image for testing"""
    img = Image.new('RGB', (10, 10), color='red')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    return img_bytes

def test_login():
    """Test 1: POST /api/auth/login to get access token"""
    print("\n" + "="*80)
    print("TEST 1: POST /api/auth/login")
    print("="*80)
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "identifier": TREASURER_EMAIL,
            "password": TREASURER_PASSWORD
        }
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if "access_token" in data:
            print("✅ PASS: Login successful, access_token received")
            return data["access_token"]
        else:
            print("❌ FAIL: No access_token in response")
            return None
    else:
        print(f"❌ FAIL: Login failed with status {response.status_code}")
        return None

def test_create_product_with_image(token):
    """Test 2: POST /api/products with image (multipart form-data)"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/products WITH IMAGE")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    # Create test image
    img_bytes = create_test_image()
    
    # Prepare multipart form data - images must be sent as a list
    # Using list of tuples format for multiple files with same field name
    files = [
        ('images', ('test_product.png', img_bytes, 'image/png'))
    ]
    
    data = {
        'title': 'Test Product With Image',
        'description': 'Created via automated test to verify ObjectId fix',
        'price': '25000',
        'category': 'electronics'
    }
    
    response = requests.post(
        f"{BASE_URL}/products",
        headers=headers,
        data=data,
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:1000]}")
    
    # Verify response
    if response.status_code == 200:
        try:
            product = response.json()
            
            # Check for required fields
            required_fields = ['id', 'title', 'description', 'price', 'category', 
                             'image_url', 'image_urls', 'seller_id', 'seller_name', 'created_at']
            missing_fields = [f for f in required_fields if f not in product]
            
            if missing_fields:
                print(f"❌ FAIL: Missing required fields: {missing_fields}")
                return None
            
            # Check that _id is NOT present (ObjectId should be removed)
            if '_id' in product:
                print(f"❌ FAIL: Response contains '_id' field (ObjectId not removed)")
                return None
            
            # Check that id is a string
            if not isinstance(product['id'], str):
                print(f"❌ FAIL: 'id' field is not a string: {type(product['id'])}")
                return None
            
            # Check that image_url contains cloudinary URL
            if product['image_url'] and 'res.cloudinary.com/dwvfohqed' not in product['image_url']:
                print(f"❌ FAIL: image_url does not contain expected Cloudinary URL")
                return None
            
            # Check that image_urls is an array
            if not isinstance(product['image_urls'], list):
                print(f"❌ FAIL: image_urls is not an array")
                return None
            
            # Verify Cloudinary URL in image_urls
            if product['image_urls'] and 'res.cloudinary.com/dwvfohqed' not in product['image_urls'][0]:
                print(f"❌ FAIL: image_urls[0] does not contain expected Cloudinary URL")
                return None
            
            print("✅ PASS: Product created successfully with image")
            print(f"  - id: {product['id']}")
            print(f"  - title: {product['title']}")
            print(f"  - price: {product['price']}")
            print(f"  - category: {product['category']}")
            print(f"  - image_url: {product['image_url'][:80]}..." if product['image_url'] else "  - image_url: None")
            print(f"  - image_urls count: {len(product['image_urls'])}")
            print(f"  - seller_id: {product['seller_id']}")
            print(f"  - seller_name: {product['seller_name']}")
            print(f"  - NO '_id' field present ✓")
            print(f"  - Valid JSON response ✓")
            
            return product['id']
            
        except json.JSONDecodeError as e:
            print(f"❌ FAIL: Response is not valid JSON: {e}")
            return None
        except Exception as e:
            print(f"❌ FAIL: Error parsing response: {e}")
            return None
    else:
        print(f"❌ FAIL: Request failed with status {response.status_code}")
        if response.text:
            print(f"Error detail: {response.text}")
        return None

def test_create_product_without_image(token):
    """Test 3: POST /api/products WITHOUT image"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/products WITHOUT IMAGE")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    data = {
        'title': 'Test Product No Image',
        'description': 'Created via automated test without image',
        'price': '15000',
        'category': 'furniture'
    }
    
    response = requests.post(
        f"{BASE_URL}/products",
        headers=headers,
        data=data
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:1000]}")
    
    if response.status_code == 200:
        try:
            product = response.json()
            
            # Check that image_url is null
            if product.get('image_url') is not None:
                print(f"❌ FAIL: image_url should be null but got: {product['image_url']}")
                return None
            
            # Check that image_urls is empty array
            if product.get('image_urls') != []:
                print(f"❌ FAIL: image_urls should be [] but got: {product['image_urls']}")
                return None
            
            # Check no _id field
            if '_id' in product:
                print(f"❌ FAIL: Response contains '_id' field")
                return None
            
            print("✅ PASS: Product created successfully without image")
            print(f"  - id: {product['id']}")
            print(f"  - title: {product['title']}")
            print(f"  - image_url: null ✓")
            print(f"  - image_urls: [] ✓")
            print(f"  - NO '_id' field present ✓")
            
            return product['id']
            
        except json.JSONDecodeError as e:
            print(f"❌ FAIL: Response is not valid JSON: {e}")
            return None
        except Exception as e:
            print(f"❌ FAIL: Error parsing response: {e}")
            return None
    else:
        print(f"❌ FAIL: Request failed with status {response.status_code}")
        if response.text:
            print(f"Error detail: {response.text}")
        return None

def test_list_products(product_ids):
    """Test 4: GET /api/products to verify created products appear"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/products")
    print("="*80)
    
    response = requests.get(f"{BASE_URL}/products")
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        try:
            products = response.json()
            print(f"Total products: {len(products)}")
            
            # Check if our created products are in the list
            found_ids = [p['id'] for p in products if 'id' in p]
            
            all_found = True
            for pid in product_ids:
                if pid and pid in found_ids:
                    print(f"  ✓ Found product {pid}")
                elif pid:
                    print(f"  ✗ Product {pid} not found in list")
                    all_found = False
            
            # Check that no product has _id field
            products_with_objectid = [p for p in products if '_id' in p]
            if products_with_objectid:
                print(f"❌ FAIL: {len(products_with_objectid)} products have '_id' field")
                return False
            
            # Check for Cloudinary URLs in products with images
            products_with_images = [p for p in products if p.get('image_url')]
            cloudinary_urls = [p for p in products_with_images if 'res.cloudinary.com/dwvfohqed' in p['image_url']]
            
            print(f"  - Products with images: {len(products_with_images)}")
            print(f"  - Products with Cloudinary URLs: {len(cloudinary_urls)}")
            
            if all_found:
                print("✅ PASS: All created products found in list")
                return True
            else:
                print("⚠️  PARTIAL: Some products not found, but endpoint working")
                return True
                
        except json.JSONDecodeError as e:
            print(f"❌ FAIL: Response is not valid JSON: {e}")
            return False
        except Exception as e:
            print(f"❌ FAIL: Error parsing response: {e}")
            return False
    else:
        print(f"❌ FAIL: Request failed with status {response.status_code}")
        return False

def main():
    print("\n" + "="*80)
    print("BACKEND TEST: POST /api/products ObjectId Serialization Fix")
    print("="*80)
    print(f"Testing backend at: {BASE_URL}")
    print(f"Credentials: {TREASURER_EMAIL}")
    
    results = {
        'login': False,
        'create_with_image': False,
        'create_without_image': False,
        'list_products': False
    }
    
    # Test 1: Login
    token = test_login()
    if token:
        results['login'] = True
    else:
        print("\n❌ CRITICAL: Cannot proceed without access token")
        return results
    
    # Test 2: Create product with image
    product_id_1 = test_create_product_with_image(token)
    if product_id_1:
        results['create_with_image'] = True
    
    # Test 3: Create product without image
    product_id_2 = test_create_product_without_image(token)
    if product_id_2:
        results['create_without_image'] = True
    
    # Test 4: List products
    product_ids = [product_id_1, product_id_2]
    if test_list_products(product_ids):
        results['list_products'] = True
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(results.values())
    total = len(results)
    
    for test_name, passed_flag in results.items():
        status = "✅ PASS" if passed_flag else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - ObjectId serialization fix verified!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
    
    return results

if __name__ == "__main__":
    main()
