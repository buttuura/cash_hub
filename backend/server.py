import importlib

try:
    _shared = importlib.import_module(".app_shared", __package__ or "backend")
    _shared = importlib.reload(_shared)
except ImportError:
    _shared = importlib.import_module("app_shared")
    _shared = importlib.reload(_shared)

app = _shared.app
api_router = _shared.api_router

# Compatibility exports for existing imports and test fixtures.
for _shared_name in dir(_shared):
    if not _shared_name.startswith("__"):
        globals()[_shared_name] = getattr(_shared, _shared_name)

import sys
from types import ModuleType


class _CompatibilityModule(ModuleType):
    def __setattr__(self, name, value):
        if name in _shared.__dict__:
            setattr(_shared, name, value)
        for loaded_route_module in _loaded_route_modules:
            if name in loaded_route_module.__dict__:
                setattr(loaded_route_module, name, value)
        super().__setattr__(name, value)


sys.modules[__name__].__class__ = _CompatibilityModule

# Load domain route modules onto the shared /api router.

route_modules = (
    "admin", "auth", "debug", "deposits", "general", "leaving", "loans",
    "members", "notifications", "orders", "petty_cash", "products",
    "projects", "push", "shop", "stats", "uploads", "withdrawals",
)
_loaded_route_modules = []
package_prefix = f"{__package__}.routes." if __package__ else "routes."
for route_module in route_modules:
    module_name = f"{package_prefix}{route_module}"
    loaded_module = importlib.import_module(module_name)
    loaded_module = importlib.reload(loaded_module)
    _loaded_route_modules.append(loaded_module)
    for route_name in dir(loaded_module):
        if not route_name.startswith("__"):
            globals()[route_name] = getattr(loaded_module, route_name)

app.include_router(api_router)

# Serve built frontend assets and product previews.
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from fastapi import HTTPException, Request
from pathlib import Path

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    static_assets = static_dir / "static"
    if static_assets.exists():
        app.mount("/static", StaticFiles(directory=str(static_assets)), name="static-assets")

    try:
        from .app_shared import UPLOAD_DIR, db
    except ImportError:
        from app_shared import UPLOAD_DIR, db
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

    @app.get("/product/{product_id}")
    async def serve_product_preview(product_id: str, request: Request):
        from bson import ObjectId
        if request.query_params.get("preview") == "1":
            index_path = static_dir / "index.html"
            if index_path.exists():
                return FileResponse(str(index_path))
            raise HTTPException(status_code=404, detail="Not found")

        product = None
        if ObjectId.is_valid(product_id):
            product = await db.products.find_one({"_id": ObjectId(product_id)})
        if product:
            product["id"] = str(product["_id"])
            product.pop("_id", None)

        base_url = str(request.base_url).rstrip("/")
        product_url = f"{base_url}/product/{product_id}?preview=1"
        title = product.get("title", "Class One Savings Group") if product else "Class One Savings Group"
        description = (product.get("description") or f"Discover {title} on Class One Savings Group.").strip()
        image_url = (product.get("image_url") or (product.get("image_urls") or [None])[0]) if product else None
        if image_url and not str(image_url).startswith(("http://", "https://", "data:")):
            image_url = f"{base_url}/{image_url.lstrip('/')}"
        elif not image_url:
            image_url = f"{base_url}/classOne-logo.png"

        escaped_title = title.replace("&", "&amp;").replace('"', "&quot;")
        escaped_description = description.replace("&", "&amp;").replace('"', "&quot;")
        escaped_image_url = str(image_url).replace("&", "&amp;")
        escaped_product_url = product_url.replace("&", "&amp;")
        html = f'''<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="refresh" content="0;url={escaped_product_url}" /><title>{escaped_title} | Class One Savings Group</title><meta property="og:title" content="{escaped_title}" /><meta property="og:description" content="{escaped_description}" /><meta property="og:url" content="{escaped_product_url}" /><meta property="og:image" content="{escaped_image_url}" /></head>
  <body><p>Redirecting to the product page… <a href="{escaped_product_url}">Continue</a></p></body>
</html>'''
        return HTMLResponse(content=html)

    @app.head("/{full_path:path}")
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        raise HTTPException(status_code=404, detail="Not found")
