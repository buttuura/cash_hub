# Image Upload System Setup Guide

## Overview
Your CashHub application now supports image uploads for products. Images are uploaded to Cloudinary and saved to MongoDB, allowing sellers to add product photos that are displayed throughout the marketplace.

## System Architecture

```
Frontend (ShopPage.js)
    ↓
    (Image selected + Product data)
    ↓
Backend (/api/products)
    ↓
    (Image uploaded to Cloudinary)
    ↓
MongoDB (image_url stored with product)
    ↓
Frontend (ShopPage displays image)
```

## Frontend Changes

### Updated Components (ShopPage.js):

1. **New State Variables**:
   - `newProductImage`: Stores the selected file
   - `newProductImagePreview`: Base64 preview of the image
   - `uploadingProduct`: Loading state during upload

2. **New Functions**:
   - `handleImageSelect()`: Validates and previews images
   - `resetProductForm()`: Clears form after submission

3. **Enhanced Product Form**:
   - Added file input with image validation (max 5MB)
   - Added image preview with remove option
   - Added disabled states during upload
   - Shows upload progress feedback

4. **Updated handleAddProduct()**:
   - Creates FormData with image file
   - Includes authentication token in request headers
   - Handles Cloudinary response with image URL
   - Stores image URL in MongoDB via backend

## Backend Configuration

### Required Environment Variables (.env):
```
CLOUDINARY_URL=cloudinary://YOUR_KEY:YOUR_SECRET@YOUR_CLOUD_NAME
MONGO_URL=mongodb://localhost:27017
DB_NAME=class_one_savings
JWT_SECRET=your_jwt_secret
```

### Existing Backend Endpoint:
- **POST `/api/products`**
  - Accepts: `title`, `description`, `price`, `category`, `image` (file), `image_url`
  - Requires: Authentication (JWT token)
  - Returns: Product object with `image_url` from Cloudinary
  - Stores: Product data in MongoDB `products` collection

### Image Upload Flow:
1. Frontend sends FormData with image file
2. Backend receives and validates file
3. Cloudinary uploads image and returns secure URL
4. Product data saved to MongoDB with image_url
5. Response sent back to frontend with image URL
6. Frontend displays image in product cards

## How It Works

### 1. Adding a Product with Image:
- User clicks "List a product"
- Fills in product details
- Selects an image file
- Sees image preview
- Clicks "Publish product"
- Image uploads to Cloudinary
- Product saved to MongoDB
- User sees success message

### 2. Displaying Products:
- Products fetched from backend or localStorage
- `image_url` field contains Cloudinary URL
- `getImageUrl()` function handles URL construction
- Images displayed in product cards (h-56 w-full)

### 3. Image Storage Path:
- **Cloudinary Folder**: `cash_hub/uploads/`
- **MongoDB Field**: `image_url` (String - Cloudinary URL)
- **File Size Limit**: 5MB (frontend validation)
- **Formats Supported**: JPG, PNG, GIF, WebP

## Testing the Setup

### 1. Verify Backend Configuration:
```bash
cd backend
python -c "import cloudinary; print('Cloudinary configured:', bool(cloudinary.config().cloud_name))"
```

### 2. Test Image Upload:
```bash
# Start backend
cd backend
python -m uvicorn server:app --reload

# Start frontend
cd frontend
npm start

# Navigate to ShopPage
# Click "List a product"
# Fill form and select image
# Click "Publish product"
```

### 3. Verify MongoDB Storage:
```bash
# Check products collection
db.products.find({image_url: {$exists: true, $ne: null}}).pretty()
```

## Frontend Environment Setup

### .env.local file:
```
REACT_APP_BACKEND_URL=http://localhost:8000
```

### For Production:
Update in `.env.local` or deployment configuration:
```
REACT_APP_BACKEND_URL=https://your-api-domain.com
```

## Security Considerations

1. **Authentication**: All product uploads require JWT token
2. **File Validation**: 
   - Frontend: Type and size validation (5MB max)
   - Backend: File type and size re-validated
3. **Image Optimization**: Cloudinary auto-optimizes large files
4. **URL Security**: Cloudinary returns secure HTTPS URLs

## Troubleshooting

### Images Not Displaying:
- Check `REACT_APP_BACKEND_URL` in frontend `.env.local`
- Verify backend is running
- Check browser console for network errors
- Verify `image_url` is saved in MongoDB

### Upload Failures:
- Check Cloudinary configuration in `.env`
- Verify JWT token is valid
- Check file size (< 5MB)
- Check browser console for error messages

### MongoDB Not Saving Images:
- Verify MongoDB is running
- Check backend logs for insert errors
- Ensure user is authenticated

## Database Schema

### Products Collection:
```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  price: Number,
  category: String,
  image_url: String,  // Cloudinary URL
  seller_id: String,
  seller_name: String,
  sellerName: String,
  created_at: ISO8601DateTime
}
```

## API Response Example

### POST /api/products
```json
{
  "id": "64f5a3b2c1d2e3f4a5b6c7d8",
  "title": "Fresh Farm Eggs",
  "description": "Pack of 30 farm-fresh eggs",
  "price": 15000,
  "category": "food",
  "image_url": "https://res.cloudinary.com/dwvfohqed/image/upload/v1693814962/cash_hub/uploads/egg_photo.jpg",
  "seller_id": "64f5a3b2c1d2e3f4a5b6c7d8",
  "seller_name": "Jane Doe",
  "created_at": "2024-06-05T10:30:00.000Z"
}
```

## Next Steps

1. ✅ Frontend image upload form added
2. ✅ Backend endpoint configured
3. ✅ MongoDB integration ready
4. ✅ Cloudinary integration active
5. Test the full workflow:
   - Log in as user
   - Add product with image
   - Verify image displays on shop page
   - Check MongoDB for saved URL

## Support

For issues with:
- **Cloudinary**: Check API key/secret in `.env`
- **MongoDB**: Ensure database connection in `.env`
- **Frontend**: Check browser console and network tab
- **Backend**: Check server logs for detailed errors
