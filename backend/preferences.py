from fastapi import APIRouter, Depends
from pydantic import BaseModel
from database import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

class PreferencesResponse(BaseModel):
    name_card_text: str
    name_card_title: str
    pip_position: str
    pip_size: str

class UpdatePreferencesRequest(BaseModel):
    name_card_text: str | None = None
    name_card_title: str | None = None
    pip_position: str | None = None
    pip_size: str | None = None

@router.get("", response_model=PreferencesResponse)
def get_preferences(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT name_card_text, name_card_title, pip_position, pip_size
               FROM user_preferences WHERE user_id = ?""",
            (current_user["id"],)
        )
        row = cursor.fetchone()
        if row:
            return dict(row)
        return {
            "name_card_text": "",
            "name_card_title": "",
            "pip_position": "bottom-right",
            "pip_size": "medium"
        }

@router.put("", response_model=PreferencesResponse)
def update_preferences(
    request: UpdatePreferencesRequest,
    current_user: dict = Depends(get_current_user)
):
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT id FROM user_preferences WHERE user_id = ?",
            (current_user["id"],)
        )
        exists = cursor.fetchone()

        if exists:
            updates = []
            values = []
            if request.name_card_text is not None:
                updates.append("name_card_text = ?")
                values.append(request.name_card_text)
            if request.name_card_title is not None:
                updates.append("name_card_title = ?")
                values.append(request.name_card_title)
            if request.pip_position is not None:
                updates.append("pip_position = ?")
                values.append(request.pip_position)
            if request.pip_size is not None:
                updates.append("pip_size = ?")
                values.append(request.pip_size)

            if updates:
                values.append(current_user["id"])
                cursor.execute(
                    f"UPDATE user_preferences SET {', '.join(updates)} WHERE user_id = ?",
                    values
                )
        else:
            cursor.execute(
                """INSERT INTO user_preferences (user_id, name_card_text, name_card_title, pip_position, pip_size)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    current_user["id"],
                    request.name_card_text or "",
                    request.name_card_title or "",
                    request.pip_position or "bottom-right",
                    request.pip_size or "medium"
                )
            )

        cursor.execute(
            """SELECT name_card_text, name_card_title, pip_position, pip_size
               FROM user_preferences WHERE user_id = ?""",
            (current_user["id"],)
        )
        row = cursor.fetchone()
        return dict(row)
