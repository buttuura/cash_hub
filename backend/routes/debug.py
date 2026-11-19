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


@api_router.get("/debug/cloudinary-status")
async def cloudinary_status(user: dict = Depends(require_treasurer)):
    is_configured = bool(CLOUDINARY_URL)
    status = {
        "cloudinary_configured": is_configured,
        "cloudinary_url_present": is_configured,
    }
    
    if is_configured:
        try:
            config = cloudinary.config()
            status["cloudinary_cloud_name"] = config.cloud_name
            status["cloudinary_api_key"] = "***" if config.api_key else None
            status["status"] = "OK - Cloudinary is configured"
        except Exception as e:
            status["status"] = f"ERROR - {str(e)}"
            status["error"] = str(e)
    else:
        status["status"] = "ERROR - Cloudinary is not configured"
        status["message"] = "CLOUDINARY_URL environment variable is not set"
    
    return status

