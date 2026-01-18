import base64
import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError

from websocket_manager import get_connection_manager
from ai_service import get_ai_service
from rate_limiter import get_rate_limiter
from config import is_ai_available
from auth_utils import SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)

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

    # Must accept WebSocket before doing anything else
    await websocket.accept()

    # Verify token
    user = verify_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    manager = get_connection_manager()
    ai_service = get_ai_service()
    rate_limiter = get_rate_limiter()

    # Initialize AI service if available (with error handling)
    ai_initialized = False
    if is_ai_available():
        try:
            ai_service.initialize()
            ai_initialized = ai_service.is_ready
        except Exception as e:
            logger.error(f"Failed to initialize AI service: {e}")
            # Continue without AI - transcription won't work but connection stays open

    await manager.connect(websocket, user["id"], session_id)

    # Send connected message with AI status
    await manager.send_personal_message({
        "type": "connected",
        "session_id": session_id,
        "ai_available": ai_initialized,
        "message": "Ready" if ai_initialized else "AI unavailable"
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
                generate_image = message.get("generate_image", True)

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
                    suggestion = result["suggestion"]
                    image_url = None

                    # Generate image if requested and we have a prompt
                    if generate_image and suggestion.get("image_prompt"):
                        image_result = await ai_service.generate_image(
                            suggestion["image_prompt"],
                            aspect_ratio="16:9"
                        )
                        if image_result.get("image_url"):
                            image_url = image_result["image_url"]

                    await manager.send_personal_message({
                        "type": "suggestion",
                        "suggestion": suggestion,
                        "image_url": image_url
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
        # Normal disconnect
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason="Internal error")
        except Exception:
            pass  # Connection may already be closed
    finally:
        await manager.disconnect(websocket)
