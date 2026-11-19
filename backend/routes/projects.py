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


@api_router.post("/projects")
async def create_project(project: ProjectCreate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ["member", "seller", "admin", "super_admin", "treasurer"]:
        raise HTTPException(status_code=403, detail="Members or staff only")

    title = project.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Project title is required")

    project_data = {
        "title": title,
        "description": project.description.strip() if project.description else None,
        "category": project.category.strip() if project.category else None,
        "author_id": user["id"],
        "author_name": user.get("name") or user.get("full_name") or "Member",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    result = await db.projects.insert_one(project_data)
    project_id = str(result.inserted_id)
    await db.projects.update_one(
        {"_id": result.inserted_id},
        {"$set": {"project_id": project_id, "id": project_id}},
    )
    project_data["id"] = project_id
    project_data["project_id"] = project_id
    project_data.pop("_id", None)
    return project_data


@api_router.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    allowed_roles = {"member", "seller", "admin", "super_admin", "treasurer"}
    if user.get("role") not in allowed_roles:
        raise HTTPException(status_code=403, detail="Members or staff only")

    projects = await db.projects.find({}).sort("created_at", -1).to_list(200)
    project_ids = [str(project.get("project_id") or project.get("id") or str(project.get("_id"))) for project in projects]

    comments = []
    if project_ids:
        comments = await db.project_comments.find({"project_id": {"$in": project_ids}}).sort("created_at", -1).to_list(500)

    comments_by_project = {}
    for comment in comments:
        comment["id"] = str(comment["_id"])
        comment.pop("_id", None)
        comments_by_project.setdefault(comment["project_id"], []).append(comment)

    ratings = []
    if project_ids:
        ratings = await db.project_ratings.find({"project_id": {"$in": project_ids}}).to_list(1000)

    ratings_by_project = {}
    for rating in ratings:
        ratings_by_project.setdefault(rating["project_id"], []).append(rating)

    result = []
    for project in projects:
        project_id = str(project.get("project_id") or project.get("id") or str(project.get("_id")))
        project["id"] = project_id
        project.pop("_id", None)
        project["project_id"] = project_id
        project_comments = comments_by_project.get(project_id, [])
        project["comments"] = project_comments
        project_ratings = ratings_by_project.get(project_id, [])
        project["ratings"] = project_ratings
        project["rating_count"] = len(project_ratings)
        project["average_rating"] = (
            round(sum((r.get("rating") or 0) for r in project_ratings) / len(project_ratings), 2)
            if project_ratings else 0
        )
        result.append(serialize_mongo_document(project))
    return result


@api_router.post("/projects/{project_id}/comments")
async def add_project_comment(project_id: str, comment: ProjectCommentCreate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ["member", "seller", "admin", "super_admin", "treasurer"]:
        raise HTTPException(status_code=403, detail="Members or staff only")

    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    comment_data = {
        "project_id": project_id,
        "user_id": user["id"],
        "user_name": user.get("name") or user.get("full_name") or "Member",
        "comment": comment.comment.strip() if isinstance(comment.comment, str) else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    result = await db.project_comments.insert_one(comment_data)
    comment_data["id"] = str(result.inserted_id)
    comment_data.pop("_id", None)
    return comment_data


@api_router.delete("/projects/{project_id}/comments/{comment_id}")
async def delete_project_comment(project_id: str, comment_id: str, user: dict = Depends(require_admin)):
    try:
        comment_object_id = ObjectId(comment_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid comment id")

    result = await db.project_comments.delete_one({
        "_id": comment_object_id,
        "project_id": project_id,
    })
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Comment not found")

    return {"message": "Comment deleted", "id": comment_id}


@api_router.post("/projects/{project_id}/ratings")
async def rate_project(project_id: str, rating: ProjectRatingCreate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ["member", "seller"]:
        raise HTTPException(status_code=403, detail="Members only")

    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if rating.rating < 1 or rating.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    rating_data = {
        "project_id": project_id,
        "user_id": user["id"],
        "user_name": user.get("name") or user.get("full_name") or "Member",
        "rating": rating.rating,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.project_ratings.update_one(
        {"project_id": project_id, "user_id": user["id"]},
        {"$set": rating_data},
        upsert=True,
    )
    return {"message": "Rating saved", "rating": rating.rating}


@api_router.get("/projects/{project_id}/ratings")
async def get_project_ratings(project_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ["member", "seller"]:
        raise HTTPException(status_code=403, detail="Members only")

    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ratings = await db.project_ratings.find({"project_id": project_id}).to_list(200)
    for rating in ratings:
        rating["id"] = str(rating["_id"])
        rating.pop("_id", None)
    return ratings


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "super_admin", "treasurer"]:
        raise HTTPException(status_code=403, detail="Admins only")

    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.projects.delete_one({"_id": project["_id"]})
    await db.project_comments.delete_many({"project_id": project_id})
    await db.project_ratings.delete_many({"project_id": project_id})
    return {"message": "Project deleted", "id": project_id}

