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
    pip_shape: str

class UpdatePreferencesRequest(BaseModel):
    name_card_text: str | None = None
    name_card_title: str | None = None
    pip_position: str | None = None
    pip_size: str | None = None
    pip_shape: str | None = None

@router.get("", response_model=PreferencesResponse)
def get_preferences(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT name_card_text, name_card_title, pip_position, pip_size, pip_shape
               FROM user_preferences WHERE user_id = ?""",
            (current_user["id"],)
        )
        row = cursor.fetchone()
        if row:
            result = dict(row)
            # Handle case where pip_shape might be None for old records
            if result.get('pip_shape') is None:
                result['pip_shape'] = 'circle'
            return result
        return {
            "name_card_text": "",
            "name_card_title": "",
            "pip_position": "bottom-right",
            "pip_size": "medium",
            "pip_shape": "circle"
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
            if request.pip_shape is not None:
                updates.append("pip_shape = ?")
                values.append(request.pip_shape)

            if updates:
                values.append(current_user["id"])
                cursor.execute(
                    f"UPDATE user_preferences SET {', '.join(updates)} WHERE user_id = ?",
                    values
                )
        else:
            cursor.execute(
                """INSERT INTO user_preferences (user_id, name_card_text, name_card_title, pip_position, pip_size, pip_shape)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    current_user["id"],
                    request.name_card_text or "",
                    request.name_card_title or "",
                    request.pip_position or "bottom-right",
                    request.pip_size or "medium",
                    request.pip_shape or "circle"
                )
            )

        cursor.execute(
            """SELECT name_card_text, name_card_title, pip_position, pip_size, pip_shape
               FROM user_preferences WHERE user_id = ?""",
            (current_user["id"],)
        )
        row = cursor.fetchone()
        result = dict(row)
        if result.get('pip_shape') is None:
            result['pip_shape'] = 'circle'
        return result
