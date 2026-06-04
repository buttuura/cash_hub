# Cash Hub

This repository already includes Cloudinary file storage support in `backend/server.py`.

## Cloudinary setup

1. Create a Cloudinary account.
2. Add a Cloudinary API key and secret.
3. Set `CLOUDINARY_URL` in your backend environment.

Example:

```env
CLOUDINARY_URL=cloudinary://<API_KEY>:<API_SECRET>@<CLOUD_NAME>
```

## Available upload routes

- `POST /api/uploads` - upload a file and store metadata in MongoDB.
- `POST /api/products` - create a product and optionally upload an image to Cloudinary.

## Local configuration

Copy `backend/.env.example` to `backend/.env` and fill in your values.
