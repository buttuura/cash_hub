"""Domain routes loaded into the shared API router."""

try:
    from .. import app_shared as _shared
    from ..app_shared import *
except ImportError:
    import app_shared as _shared
    from app_shared import *

for _name in dir(_shared):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_shared, _name)


@api_router.post("/uploads")
async def upload_media(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    logger.info(f"Upload started for file: {file.filename}, user: {user['id']}")
    
    try:
        upload_result = await upload_to_cloudinary(file)
        logger.info(f"Cloudinary upload successful: public_id={upload_result.get('public_id')}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File upload to cloud failed: {str(e)}")
    
    url = upload_result.get("secure_url") or upload_result.get("url")
    if not url:
        logger.error(f"No URL in Cloudinary response: {upload_result}")
        raise HTTPException(status_code=500, detail="Cloud upload returned no URL")
    
    upload_metadata = {
        "file_name": file.filename,
        "content_type": file.content_type,
        "url": url,
        "cloudinary": {
            "public_id": upload_result.get("public_id"),
            "resource_type": upload_result.get("resource_type"),
            "format": upload_result.get("format"),
            "bytes": upload_result.get("bytes"),
            "width": upload_result.get("width"),
            "height": upload_result.get("height"),
            "secure_url": upload_result.get("secure_url"),
            "original_filename": upload_result.get("original_filename"),
            "folder": upload_result.get("folder"),
            "type": upload_result.get("type"),
        },
        "uploaded_by": user["id"],
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = await db.uploads.insert_one(upload_metadata)
        logger.info(f"Upload metadata saved to MongoDB: {result.inserted_id}")
    except Exception as e:
        logger.exception("Failed to save upload metadata")
        raise HTTPException(status_code=500, detail=f"Failed to save file metadata: {str(e)}")

    upload_metadata["id"] = str(result.inserted_id)
    upload_metadata.pop("_id", None)
    return upload_metadata

