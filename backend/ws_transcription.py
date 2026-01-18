import base64
import json
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError

from websocket_manager import get_connection_manager
from ai_service import get_ai_service
from rate_limiter import get_rate_limiter
from config import is_ai_available

# JWT settings (should match user_auth.py)
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"

router = APIRouter()


def verify_token(token: str) -> Optional[dict]:
    """Verify a JWT token and return the user data."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return {"id": int(user_id)}
    except JWTError:
        return None


@router.websocket("/ws/transcription")
async def transcription_websocket(
    websocket: WebSocket,
    token: str = Query(...),
    session_id: str = Query(...)
):
    """WebSocket endpoint for real-time transcription and AI suggestions."""

    # Verify token
    user = verify_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    manager = get_connection_manager()
    ai_service = get_ai_service()
    rate_limiter = get_rate_limiter()

    # Initialize AI service if available
    if is_ai_available():
        ai_service.initialize()

    await manager.connect(websocket, user["id"], session_id)

    # Send connected message
    await manager.send_personal_message({
        "type": "connected",
        "session_id": session_id,
        "ai_available": ai_service.is_ready,
    }, websocket)

    try:
        while True:
            # Receive message
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "error",
                    "message": "Invalid JSON"
                }, websocket)
                continue

            msg_type = message.get("type")

            if msg_type == "ping":
                await manager.send_personal_message({
                    "type": "pong",
                    "timestamp": message.get("timestamp")
                }, websocket)

            elif msg_type == "audio_chunk":
                # Process audio chunk for transcription
                if not ai_service.is_ready:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "AI service not available"
                    }, websocket)
                    continue

                # Check rate limit
                rate_check = rate_limiter.can_make_call(user["id"], session_id, "transcription")
                if not rate_check["allowed"]:
                    await manager.send_personal_message({
                        "type": "rate_limited",
                        "reason": rate_check["reason"],
                        "message": rate_check["message"],
                        "retry_after_seconds": rate_check["retry_after_seconds"]
                    }, websocket)
                    continue

                # Decode audio data
                audio_base64 = message.get("audio")
                if not audio_base64:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "No audio data provided"
                    }, websocket)
                    continue

                try:
                    audio_bytes = base64.b64decode(audio_base64)
                except Exception:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "Invalid audio data encoding"
                    }, websocket)
                    continue

                # Record the call
                rate_limiter.record_call(user["id"], session_id, "transcription")

                # Transcribe
                mime_type = message.get("mime_type", "audio/webm")
                result = await ai_service.transcribe_audio_chunk(audio_bytes, mime_type)

                if result.get("error"):
                    await manager.send_personal_message({
                        "type": "error",
                        "message": f"Transcription failed: {result['error']}"
                    }, websocket)
                else:
                    await manager.send_personal_message({
                        "type": "transcription",
                        "text": result["text"],
                        "chunk_id": message.get("chunk_id")
                    }, websocket)

            elif msg_type == "request_suggestion":
                # Generate AI suggestion based on transcript
                if not ai_service.is_ready:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "AI service not available"
                    }, websocket)
                    continue

                # Check rate limit
                rate_check = rate_limiter.can_make_call(user["id"], session_id, "suggestion")
                if not rate_check["allowed"]:
                    await manager.send_personal_message({
                        "type": "rate_limited",
                        "reason": rate_check["reason"],
                        "message": rate_check["message"],
                        "retry_after_seconds": rate_check["retry_after_seconds"]
                    }, websocket)
                    continue

                transcript = message.get("transcript", "")
                context = message.get("context")

                if not transcript:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "No transcript provided"
                    }, websocket)
                    continue

                # Record the call
                rate_limiter.record_call(user["id"], session_id, "suggestion")

                # Generate suggestion
                result = await ai_service.generate_suggestion(transcript, context)

                if result.get("error"):
                    await manager.send_personal_message({
                        "type": "error",
                        "message": f"Suggestion failed: {result['error']}"
                    }, websocket)
                elif result.get("suggestion"):
                    await manager.send_personal_message({
                        "type": "suggestion",
                        "suggestion": result["suggestion"]
                    }, websocket)
                else:
                    await manager.send_personal_message({
                        "type": "no_suggestion",
                        "message": "No visual suggestion needed for this content"
                    }, websocket)

            elif msg_type == "get_rate_limits":
                remaining = rate_limiter.get_remaining_calls(user["id"], session_id)
                await manager.send_personal_message({
                    "type": "rate_limits",
                    **remaining
                }, websocket)

            elif msg_type == "detect_moments":
                # Detect visual moments in transcript window
                if not ai_service.is_ready:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "AI service not available"
                    }, websocket)
                    continue

                # Check rate limit
                rate_check = rate_limiter.can_make_call(user["id"], session_id, "moment_detection")
                if not rate_check["allowed"]:
                    await manager.send_personal_message({
                        "type": "rate_limited",
                        "reason": rate_check["reason"],
                        "message": rate_check["message"],
                        "retry_after_seconds": rate_check["retry_after_seconds"]
                    }, websocket)
                    continue

                transcript_window = message.get("transcript_window", "")
                if not transcript_window:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "No transcript window provided"
                    }, websocket)
                    continue

                # Record the call
                rate_limiter.record_call(user["id"], session_id, "moment_detection")

                # Detect moments
                moments = await ai_service.detect_visual_moments(transcript_window)

                await manager.send_personal_message({
                    "type": "visual_moments",
                    "moments": moments
                }, websocket)

            else:
                await manager.send_personal_message({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}"
                }, websocket)

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
