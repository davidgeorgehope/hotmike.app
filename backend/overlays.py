import os
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from database import get_db
from user_auth import get_current_user

router = APIRouter(prefix="/api/overlays", tags=["overlays"])

# Storage path for overlays
OVERLAYS_DIR = Path(__file__).parent.parent / "data" / "overlays"
OVERLAYS_DIR.mkdir(parents=True, exist_ok=True)

# Allowed file types and max size
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/upload")
async def upload_overlay(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload a new overlay image."""
    # Validate mime type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_MIME_TYPES)}"
        )

    # Read file and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB"
        )

    # Generate unique filename
    ext = Path(file.filename or "image").suffix or ".png"
    filename = f"{uuid.uuid4()}{ext}"
    file_path = OVERLAYS_DIR / filename

    # Save file
    with open(file_path, "wb") as f:
        f.write(content)

    # Save to database
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO manual_overlays (user_id, filename, original_name, mime_type, file_size)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user["id"], filename, file.filename or "image", file.content_type, len(content))
        )
        overlay_id = cursor.lastrowid

    return {
        "id": overlay_id,
        "filename": filename,
        "original_name": file.filename,
        "mime_type": file.content_type,
        "file_size": len(content)
    }


@router.get("")
def list_overlays(user: dict = Depends(get_current_user)):
    """List all overlays for the current user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, original_name, mime_type, file_size, created_at
            FROM manual_overlays
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user["id"],)
        )
        rows = cursor.fetchall()

    return [
        {
            "id": row["id"],
            "filename": row["filename"],
            "original_name": row["original_name"],
            "mime_type": row["mime_type"],
            "file_size": row["file_size"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


@router.get("/{overlay_id}/image")
def get_overlay_image(overlay_id: int, user: dict = Depends(get_current_user)):
    """Serve an overlay image."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT filename, mime_type
            FROM manual_overlays
            WHERE id = ? AND user_id = ?
            """,
            (overlay_id, user["id"])
        )
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Overlay not found")

    file_path = OVERLAYS_DIR / row["filename"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    return FileResponse(
        path=file_path,
        media_type=row["mime_type"],
        filename=row["filename"]
    )


@router.delete("/{overlay_id}")
def delete_overlay(overlay_id: int, user: dict = Depends(get_current_user)):
    """Delete an overlay."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Get filename first
        cursor.execute(
            """
            SELECT filename FROM manual_overlays
            WHERE id = ? AND user_id = ?
            """,
            (overlay_id, user["id"])
        )
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Overlay not found")

        # Delete file
        file_path = OVERLAYS_DIR / row["filename"]
        if file_path.exists():
            os.remove(file_path)

        # Delete from database
        cursor.execute(
            "DELETE FROM manual_overlays WHERE id = ? AND user_id = ?",
            (overlay_id, user["id"])
        )

    return {"message": "Overlay deleted"}
