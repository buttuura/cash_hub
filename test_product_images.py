#!/usr/bin/env python3
"""
Test POST /api/products with image uploads after multipart validation fix.
Tests 3 cases:
- CASE A: POST without images
- CASE B: POST with ONE image
- CASE C: POST with MULTIPLE images
"""

import requests
import io
from PIL import Image

BASE_URL = "http://localhost:8001"
CREDENTIALS = {
    "identifier": "treasurer@savingsgroup.com",
    "password": "Treasurer@123"
}

def create_test_image(color=(255, 0, 0), size=(10, 10)):
    """Create a small test PNG image in memory"""
    img = Image.new('RGB', size, color=color)
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    return img_bytes

def login():
    """Login and get access token"""
    print("🔐 Logging in as treasurer...")
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=CREDENTIALS
    )
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        print(f"   Response: {response.text}")
        return None
    
    data = response.json()
    token = data.get('access_token')
    print(f"✅ Login successful. User: {data.get('name')}")
    return token

def test_case_a_no_images(token):
    """CASE A: POST /api/products WITHOUT images"""
    print("\n" + "="*60)
    print("CASE A: POST /api/products WITHOUT images")
    print("="*60)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # multipart/form-data with NO images field at all
    data = {
        "title": "Test Product No Images",
        "description": "Product without any images",
        "price": 25000,
        "category": "Electronics"
    }
    
    response = requests.post(
        f"{BASE_URL}/api/products",
        headers=headers,
        data=data  # Using data= for form fields, no files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ CASE A FAILED")
        print(f"   Response: {response.text}")
        return False
    
    result = response.json()
    print(f"✅ Status: 200 OK")
    print(f"   Response keys: {list(result.keys())}")
    
    # Verify response structure
    checks = []
    
    # Check required fields
    if "id" in result and isinstance(result["id"], str):
        print(f"   ✓ id: {result['id']} (string)")
        checks.append(True)
    else:
        print(f"   ✗ id field missing or not string")
        checks.append(False)
    
    if "_id" not in result:
        print(f"   ✓ No '_id' field (ObjectId properly removed)")
        checks.append(True)
    else:
        print(f"   ✗ '_id' field present: {result.get('_id')}")
        checks.append(False)
    
    if result.get("image_url") is None:
        print(f"   ✓ image_url: null")
        checks.append(True)
    else:
        print(f"   ✗ image_url should be null, got: {result.get('image_url')}")
        checks.append(False)
    
    if result.get("image_urls") == []:
        print(f"   ✓ image_urls: []")
        checks.append(True)
    else:
        print(f"   ✗ image_urls should be [], got: {result.get('image_urls')}")
        checks.append(False)
    
    if result.get("title") == "Test Product No Images":
        print(f"   ✓ title: {result['title']}")
        checks.append(True)
    else:
        print(f"   ✗ title mismatch")
        checks.append(False)
    
    if result.get("price") == 25000:
        print(f"   ✓ price: {result['price']}")
        checks.append(True)
    else:
        print(f"   ✗ price mismatch")
        checks.append(False)
    
    if all(checks):
        print("\n✅ CASE A PASSED: All checks passed")
        return True
    else:
        print(f"\n❌ CASE A FAILED: {sum(checks)}/{len(checks)} checks passed")
        return False

def test_case_b_one_image(token):
    """CASE B: POST /api/products WITH ONE image"""
    print("\n" + "="*60)
    print("CASE B: POST /api/products WITH ONE image")
    print("="*60)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create test image
    img_bytes = create_test_image(color=(0, 255, 0), size=(10, 10))
    
    # multipart/form-data with ONE image
    data = {
        "title": "Test Product One Image",
        "description": "Product with one image",
        "price": 35000,
        "category": "Furniture"
    }
    
    files = {
        "images": ("test_image_1.png", img_bytes, "image/png")
    }
    
    response = requests.post(
        f"{BASE_URL}/api/products",
        headers=headers,
        data=data,
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ CASE B FAILED")
        print(f"   Response: {response.text}")
        return False
    
    result = response.json()
    print(f"✅ Status: 200 OK")
    print(f"   Response keys: {list(result.keys())}")
    
    # Verify response structure
    checks = []
    
    # Check required fields
    if "id" in result and isinstance(result["id"], str):
        print(f"   ✓ id: {result['id']} (string)")
        checks.append(True)
    else:
        print(f"   ✗ id field missing or not string")
        checks.append(False)
    
    if "_id" not in result:
        print(f"   ✓ No '_id' field (ObjectId properly removed)")
        checks.append(True)
    else:
        print(f"   ✗ '_id' field present: {result.get('_id')}")
        checks.append(False)
    
    image_url = result.get("image_url")
    if image_url and isinstance(image_url, str) and "res.cloudinary.com/dwvfohqed/" in image_url:
        print(f"   ✓ image_url: {image_url[:60]}...")
        checks.append(True)
    else:
        print(f"   ✗ image_url invalid: {image_url}")
        checks.append(False)
    
    image_urls = result.get("image_urls")
    if isinstance(image_urls, list) and len(image_urls) == 1:
        print(f"   ✓ image_urls: list with 1 URL")
        if "res.cloudinary.com/dwvfohqed/" in image_urls[0]:
            print(f"      URL: {image_urls[0][:60]}...")
            checks.append(True)
        else:
            print(f"      ✗ URL doesn't match cloudinary pattern")
            checks.append(False)
    else:
        print(f"   ✗ image_urls should be list with 1 item, got: {image_urls}")
        checks.append(False)
    
    if result.get("title") == "Test Product One Image":
        print(f"   ✓ title: {result['title']}")
        checks.append(True)
    else:
        print(f"   ✗ title mismatch")
        checks.append(False)
    
    if all(checks):
        print("\n✅ CASE B PASSED: All checks passed")
        return True
    else:
        print(f"\n❌ CASE B FAILED: {sum(checks)}/{len(checks)} checks passed")
        return False

def test_case_c_multiple_images(token):
    """CASE C: POST /api/products WITH MULTIPLE images"""
    print("\n" + "="*60)
    print("CASE C: POST /api/products WITH MULTIPLE images")
    print("="*60)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create two test images
    img1_bytes = create_test_image(color=(255, 0, 0), size=(10, 10))
    img2_bytes = create_test_image(color=(0, 0, 255), size=(10, 10))
    
    # multipart/form-data with TWO images (same field name)
    data = {
        "title": "Test Product Multiple Images",
        "description": "Product with multiple images",
        "price": 45000,
        "category": "Clothing"
    }
    
    # Use list of tuples for multiple files with same field name
    files = [
        ("images", ("test_image_1.png", img1_bytes, "image/png")),
        ("images", ("test_image_2.png", img2_bytes, "image/png"))
    ]
    
    response = requests.post(
        f"{BASE_URL}/api/products",
        headers=headers,
        data=data,
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ CASE C FAILED")
        print(f"   Response: {response.text}")
        return False
    
    result = response.json()
    print(f"✅ Status: 200 OK")
    print(f"   Response keys: {list(result.keys())}")
    
    # Verify response structure
    checks = []
    
    # Check required fields
    if "id" in result and isinstance(result["id"], str):
        print(f"   ✓ id: {result['id']} (string)")
        checks.append(True)
    else:
        print(f"   ✗ id field missing or not string")
        checks.append(False)
    
    if "_id" not in result:
        print(f"   ✓ No '_id' field (ObjectId properly removed)")
        checks.append(True)
    else:
        print(f"   ✗ '_id' field present: {result.get('_id')}")
        checks.append(False)
    
    image_url = result.get("image_url")
    if image_url and isinstance(image_url, str) and "res.cloudinary.com/dwvfohqed/" in image_url:
        print(f"   ✓ image_url: {image_url[:60]}...")
        checks.append(True)
    else:
        print(f"   ✗ image_url invalid: {image_url}")
        checks.append(False)
    
    image_urls = result.get("image_urls")
    if isinstance(image_urls, list) and len(image_urls) == 2:
        print(f"   ✓ image_urls: list with 2 URLs")
        all_valid = all("res.cloudinary.com/dwvfohqed/" in url for url in image_urls)
        if all_valid:
            print(f"      URL 1: {image_urls[0][:60]}...")
            print(f"      URL 2: {image_urls[1][:60]}...")
            checks.append(True)
        else:
            print(f"      ✗ Some URLs don't match cloudinary pattern")
            checks.append(False)
    else:
        print(f"   ✗ image_urls should be list with 2 items, got: {image_urls}")
        checks.append(False)
    
    if result.get("title") == "Test Product Multiple Images":
        print(f"   ✓ title: {result['title']}")
        checks.append(True)
    else:
        print(f"   ✗ title mismatch")
        checks.append(False)
    
    if all(checks):
        print("\n✅ CASE C PASSED: All checks passed")
        return True
    else:
        print(f"\n❌ CASE C FAILED: {sum(checks)}/{len(checks)} checks passed")
        return False

def test_get_products(token):
    """Verify GET /api/products lists all created products"""
    print("\n" + "="*60)
    print("VERIFY: GET /api/products")
    print("="*60)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(
        f"{BASE_URL}/api/products",
        headers=headers
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ GET /api/products FAILED")
        print(f"   Response: {response.text}")
        return False
    
    products = response.json()
    print(f"✅ Status: 200 OK")
    print(f"   Total products: {len(products)}")
    
    # Check that all products have string 'id' and no '_id'
    checks = []
    for i, product in enumerate(products[:5]):  # Check first 5
        has_id = "id" in product and isinstance(product["id"], str)
        no_objectid = "_id" not in product
        if has_id and no_objectid:
            checks.append(True)
        else:
            print(f"   ✗ Product {i}: id={has_id}, no_objectid={no_objectid}")
            checks.append(False)
    
    if all(checks):
        print(f"   ✓ All checked products have string 'id', no '_id'")
        print("\n✅ GET /api/products PASSED")
        return True
    else:
        print(f"\n❌ GET /api/products FAILED: Some products have issues")
        return False

def test_cloudinary_status(token):
    """Verify GET /api/debug/cloudinary-status returns OK"""
    print("\n" + "="*60)
    print("VERIFY: GET /api/debug/cloudinary-status")
    print("="*60)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(
        f"{BASE_URL}/api/debug/cloudinary-status",
        headers=headers
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ GET /api/debug/cloudinary-status FAILED")
        print(f"   Response: {response.text}")
        return False
    
    result = response.json()
    print(f"✅ Status: 200 OK")
    print(f"   cloudinary_configured: {result.get('cloudinary_configured')}")
    print(f"   cloudinary_cloud_name: {result.get('cloudinary_cloud_name')}")
    print(f"   status: {result.get('status')}")
    
    if result.get('cloudinary_configured') and result.get('status') == 'OK - Cloudinary is configured':
        print("\n✅ Cloudinary status PASSED")
        return True
    else:
        print("\n❌ Cloudinary status FAILED")
        return False

def main():
    print("🚀 Testing POST /api/products with image uploads")
    print("   Backend: http://localhost:8001")
    print("   Credentials: treasurer@savingsgroup.com")
    print()
    
    # Login
    token = login()
    if not token:
        print("\n❌ Cannot proceed without authentication")
        return 1
    
    # Run all test cases
    results = {
        "CASE A (no images)": test_case_a_no_images(token),
        "CASE B (one image)": test_case_b_one_image(token),
        "CASE C (multiple images)": test_case_c_multiple_images(token),
        "GET /api/products": test_get_products(token),
        "GET /api/debug/cloudinary-status": test_cloudinary_status(token)
    }
    
    # Summary
    print("\n" + "="*60)
    print("📊 TEST SUMMARY")
    print("="*60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    total = len(results)
    passed = sum(results.values())
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if all(results.values()):
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print("\n⚠️  SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    exit(main())
