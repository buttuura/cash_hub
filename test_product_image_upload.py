#!/usr/bin/env python3
"""Quick test for POST /api/products with image"""

import requests
import io
from PIL import Image

BASE_URL = "http://localhost:8001/api"

# Login
response = requests.post(
    f"{BASE_URL}/auth/login",
    json={"identifier": "treasurer@savingsgroup.com", "password": "Treasurer@123"}
)
token = response.json()["access_token"]
print(f"Token: {token[:50]}...")

# Create image
img = Image.new('RGB', (10, 10), color='green')
img_bytes = io.BytesIO()
img.save(img_bytes, format='PNG')
img_bytes.seek(0)

# Try different approaches
print("\n=== Approach 1: Single file in list ===")
files = [('images', ('test.png', img_bytes, 'image/png'))]
data = {'title': 'Test 1', 'description': 'Test', 'price': '1000', 'category': 'electronics'}
response = requests.post(
    f"{BASE_URL}/products",
    headers={"Authorization": f"Bearer {token}"},
    data=data,
    files=files
)
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:500]}")

# Reset image bytes
img_bytes.seek(0)

print("\n=== Approach 2: Multiple files with same name ===")
img2_bytes = io.BytesIO()
img.save(img2_bytes, format='PNG')
img2_bytes.seek(0)

files = [
    ('images', ('test1.png', img_bytes, 'image/png')),
    ('images', ('test2.png', img2_bytes, 'image/png'))
]
data = {'title': 'Test 2', 'description': 'Test', 'price': '2000', 'category': 'electronics'}
response = requests.post(
    f"{BASE_URL}/products",
    headers={"Authorization": f"Bearer {token}"},
    data=data,
    files=files
)
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:500]}")
