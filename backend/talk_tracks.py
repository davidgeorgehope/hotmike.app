import re
import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from database import get_db
from user_auth import get_current_user
from ai_service import get_ai_service
from config import is_ai_available

router = APIRouter(prefix="/api/talk-tracks", tags=["talk-tracks"])

# Pattern for [VISUAL:description] markers
VISUAL_MARKER_PATTERN = re.compile(r'\[VISUAL:\s*([^\]]+)\]', re.IGNORECASE)


class TalkTrackCreate(BaseModel):
    title: str
    content: str


class TalkTrackUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


def parse_visual_markers(content: str) -> List[dict]:
    """Extract [VISUAL:] markers from talk track content."""
    markers = []
    for i, match in enumerate(VISUAL_MARKER_PATTERN.finditer(content)):
        markers.append({
            "text": match.group(1).strip(),
            "index": i,
            "position": match.start(),
        })
    return markers


async def generate_prebaked_visuals(talk_track_id: int, markers: List[dict]):
    """Background task to generate images for visual markers."""
    ai_service = get_ai_service()
    if not ai_service.is_ready:
        return

    for marker in markers:
        with get_db() as conn:
            cursor = conn.cursor()

            # Check if marker already has a visual
            cursor.execute(
                """
                SELECT id, status FROM prebaked_visuals
                WHERE talk_track_id = ? AND marker_index = ?
                """,
                (talk_track_id, marker["index"])
            )
            existing = cursor.fetchone()

            if existing and existing["status"] == "completed":
                continue

            # Mark as generating
            if existing:
                cursor.execute(
                    "UPDATE prebaked_visuals SET status = 'generating' WHERE id = ?",
                    (existing["id"],)
                )
                visual_id = existing["id"]
            else:
                cursor.execute(
                    """
                    INSERT INTO prebaked_visuals (talk_track_id, marker_text, marker_index, status)
                    VALUES (?, ?, ?, 'generating')
                    """,
                    (talk_track_id, marker["text"], marker["index"])
                )
                visual_id = cursor.lastrowid

        # Generate actual image for this marker
        try:
            result = await ai_service.generate_visual_from_marker(marker["text"])

            with get_db() as conn:
                cursor = conn.cursor()
                if result.get("filename"):
                    # Store the generated image filename
                    cursor.execute(
                        """
                        UPDATE prebaked_visuals
                        SET status = 'completed',
                            image_filename = ?,
                            generated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (result["filename"], visual_id)
                    )
                else:
                    error_msg = result.get("error", "Image generation failed")
                    cursor.execute(
                        """
                        UPDATE prebaked_visuals
                        SET status = 'failed', error_message = ?
                        WHERE id = ?
                        """,
                        (error_msg, visual_id)
                    )
        except Exception as e:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE prebaked_visuals
                    SET status = 'failed', error_message = ?
                    WHERE id = ?
                    """,
                    (str(e), visual_id)
                )

        # Delay between API calls to respect rate limiting
        await asyncio.sleep(3)


@router.post("")
async def create_talk_track(
    data: TalkTrackCreate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user)
):
    """Create a new talk track and parse [VISUAL:] markers."""
    # Parse markers
    markers = parse_visual_markers(data.content)

    with get_db() as conn:
        cursor = conn.cursor()

        # Create talk track
        cursor.execute(
            """
            INSERT INTO talk_tracks (user_id, title, content)
            VALUES (?, ?, ?)
            """,
            (user["id"], data.title, data.content)
        )
        talk_track_id = cursor.lastrowid

        # Create pending prebaked visuals for each marker
        for marker in markers:
            cursor.execute(
                """
                INSERT INTO prebaked_visuals (talk_track_id, marker_text, marker_index, status)
                VALUES (?, ?, ?, 'pending')
                """,
                (talk_track_id, marker["text"], marker["index"])
            )

    # Start background generation if AI is available
    if is_ai_available() and markers:
        ai_service = get_ai_service()
        ai_service.initialize()
        background_tasks.add_task(generate_prebaked_visuals, talk_track_id, markers)

    return {
        "id": talk_track_id,
        "title": data.title,
        "content": data.content,
        "markers": markers,
        "prebaking_started": is_ai_available() and len(markers) > 0
    }


@router.get("")
def list_talk_tracks(user: dict = Depends(get_current_user)):
    """List all talk tracks for the current user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, title, content, created_at, updated_at
            FROM talk_tracks
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user["id"],)
        )
        tracks = cursor.fetchall()

        result = []
        for track in tracks:
            # Get prebaked visual status
            cursor.execute(
                """
                SELECT status, COUNT(*) as count
                FROM prebaked_visuals
                WHERE talk_track_id = ?
                GROUP BY status
                """,
                (track["id"],)
            )
            status_counts = {row["status"]: row["count"] for row in cursor.fetchall()}

            # Parse markers
            markers = parse_visual_markers(track["content"])

            result.append({
                "id": track["id"],
                "title": track["title"],
                "content": track["content"],
                "created_at": track["created_at"],
                "updated_at": track["updated_at"],
                "marker_count": len(markers),
                "prebaked_status": status_counts,
            })

    return result


@router.get("/{talk_track_id}")
def get_talk_track(talk_track_id: int, user: dict = Depends(get_current_user)):
    """Get a specific talk track with its prebaked visuals."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, title, content, created_at, updated_at
            FROM talk_tracks
            WHERE id = ? AND user_id = ?
            """,
            (talk_track_id, user["id"])
        )
        track = cursor.fetchone()

        if not track:
            raise HTTPException(status_code=404, detail="Talk track not found")

        # Get prebaked visuals
        cursor.execute(
            """
            SELECT id, marker_text, marker_index, image_filename, status, error_message, generated_at
            FROM prebaked_visuals
            WHERE talk_track_id = ?
            ORDER BY marker_index
            """,
            (talk_track_id,)
        )
        visuals = cursor.fetchall()

    return {
        "id": track["id"],
        "title": track["title"],
        "content": track["content"],
        "created_at": track["created_at"],
        "updated_at": track["updated_at"],
        "prebaked_visuals": [
            {
                "id": v["id"],
                "marker_text": v["marker_text"],
                "marker_index": v["marker_index"],
                "image_filename": v["image_filename"],
                "image_url": f"/api/generated-images/{v['image_filename']}" if v["image_filename"] else None,
                "status": v["status"],
                "error_message": v["error_message"],
                "generated_at": v["generated_at"],
            }
            for v in visuals
        ]
    }


@router.put("/{talk_track_id}")
async def update_talk_track(
    talk_track_id: int,
    data: TalkTrackUpdate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user)
):
    """Update a talk track."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Check ownership
        cursor.execute(
            "SELECT content FROM talk_tracks WHERE id = ? AND user_id = ?",
            (talk_track_id, user["id"])
        )
        existing = cursor.fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Talk track not found")

        # Update fields
        updates = []
        params = []
        if data.title is not None:
            updates.append("title = ?")
            params.append(data.title)
        if data.content is not None:
            updates.append("content = ?")
            params.append(data.content)

        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(talk_track_id)
            params.append(user["id"])

            cursor.execute(
                f"UPDATE talk_tracks SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
                params
            )

        # If content changed, re-parse markers and regenerate visuals
        if data.content is not None and data.content != existing["content"]:
            # Delete old prebaked visuals
            cursor.execute(
                "DELETE FROM prebaked_visuals WHERE talk_track_id = ?",
                (talk_track_id,)
            )

            # Parse new markers
            markers = parse_visual_markers(data.content)

            # Create new pending visuals
            for marker in markers:
                cursor.execute(
                    """
                    INSERT INTO prebaked_visuals (talk_track_id, marker_text, marker_index, status)
                    VALUES (?, ?, ?, 'pending')
                    """,
                    (talk_track_id, marker["text"], marker["index"])
                )

            # Start background generation
            if is_ai_available() and markers:
                ai_service = get_ai_service()
                ai_service.initialize()
                background_tasks.add_task(generate_prebaked_visuals, talk_track_id, markers)

    return {"message": "Talk track updated"}


@router.delete("/{talk_track_id}")
def delete_talk_track(talk_track_id: int, user: dict = Depends(get_current_user)):
    """Delete a talk track."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Check ownership
        cursor.execute(
            "SELECT id FROM talk_tracks WHERE id = ? AND user_id = ?",
            (talk_track_id, user["id"])
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Talk track not found")

        # Delete (cascade will handle prebaked_visuals)
        cursor.execute(
            "DELETE FROM talk_tracks WHERE id = ? AND user_id = ?",
            (talk_track_id, user["id"])
        )

    return {"message": "Talk track deleted"}
