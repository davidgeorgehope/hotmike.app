import os
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from database import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

RECORDINGS_DIR = Path(__file__).parent.parent / "data" / "recordings"
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

class RecordingResponse(BaseModel):
    id: int
    filename: str
    title: str
    duration_seconds: float | None
    file_size: int | None
    created_at: str

class UpdateRecordingRequest(BaseModel):
    title: str

@router.get("", response_model=list[RecordingResponse])
def list_recordings(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, filename, title, duration_seconds, file_size, created_at
               FROM recordings WHERE user_id = ? ORDER BY created_at DESC""",
            (current_user["id"],)
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

@router.post("/upload", response_model=RecordingResponse)
async def upload_recording(
    file: UploadFile = File(...),
    title: str = Form(...),
    duration_seconds: float = Form(None),
    current_user: dict = Depends(get_current_user)
):
    ext = Path(file.filename).suffix or ".webm"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = RECORDINGS_DIR / filename

    file_size = 0
    with open(filepath, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)
            file_size += len(chunk)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO recordings (user_id, filename, title, duration_seconds, file_size)
               VALUES (?, ?, ?, ?, ?)""",
            (current_user["id"], filename, title, duration_seconds, file_size)
        )
        recording_id = cursor.lastrowid

        cursor.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = cursor.fetchone()
        return dict(row)

@router.get("/{recording_id}", response_model=RecordingResponse)
def get_recording(recording_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM recordings WHERE id = ? AND user_id = ?",
            (recording_id, current_user["id"])
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Recording not found")
        return dict(row)

@router.get("/{recording_id}/download")
def download_recording(recording_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT filename, title FROM recordings WHERE id = ? AND user_id = ?",
            (recording_id, current_user["id"])
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Recording not found")

        filepath = RECORDINGS_DIR / row["filename"]
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            path=filepath,
            filename=f"{row['title']}.webm",
            media_type="video/webm"
        )

@router.put("/{recording_id}", response_model=RecordingResponse)
def update_recording(
    recording_id: int,
    request: UpdateRecordingRequest,
    current_user: dict = Depends(get_current_user)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE recordings SET title = ? WHERE id = ? AND user_id = ?",
            (request.title, recording_id, current_user["id"])
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Recording not found")

        cursor.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = cursor.fetchone()
        return dict(row)

@router.delete("/{recording_id}")
def delete_recording(recording_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT filename FROM recordings WHERE id = ? AND user_id = ?",
            (recording_id, current_user["id"])
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Recording not found")

        filepath = RECORDINGS_DIR / row["filename"]
        if filepath.exists():
            os.remove(filepath)

        cursor.execute("DELETE FROM recordings WHERE id = ?", (recording_id,))
        return {"message": "Recording deleted"}
