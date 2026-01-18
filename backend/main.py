from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from database import init_db
from user_auth import router as auth_router
from recordings import router as recordings_router
from preferences import router as preferences_router
from overlays import router as overlays_router
from talk_tracks import router as talk_tracks_router
from ws_transcription import router as ws_router
from config import get_ai_status, is_ai_available
from ai_service import get_ai_service

app = FastAPI(title="HotMike API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(recordings_router)
app.include_router(preferences_router)
app.include_router(overlays_router)
app.include_router(talk_tracks_router)
app.include_router(ws_router)

# Directory for generated images
GENERATED_IMAGES_DIR = Path(__file__).parent / "data" / "generated_images"


@app.on_event("startup")
def startup():
    init_db()
    # Ensure generated images directory exists
    GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/ai-status")
def ai_status():
    """Get AI feature availability and configuration status."""
    return get_ai_status()


@app.get("/api/generated-images/{filename}")
async def get_generated_image(filename: str):
    """Serve a generated image file."""
    # Validate filename to prevent path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = GENERATED_IMAGES_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(filepath, media_type="image/png")


class NameCardRequest(BaseModel):
    name: str
    title: Optional[str] = None


@app.post("/api/generate-name-card")
async def generate_name_card(request: NameCardRequest):
    """Generate a professional name card overlay using AI."""
    if not is_ai_available():
        raise HTTPException(status_code=503, detail="AI service not available")

    ai_service = get_ai_service()
    ai_service.initialize()

    result = await ai_service.generate_name_card_image(request.name, request.title)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "image_url": result["image_url"],
        "filename": result["filename"]
    }


class ImageGenerationRequest(BaseModel):
    prompt: str
    aspect_ratio: Optional[str] = "16:9"


@app.post("/api/generate-image")
async def generate_image(request: ImageGenerationRequest):
    """Generate an image from a text prompt using AI."""
    if not is_ai_available():
        raise HTTPException(status_code=503, detail="AI service not available")

    ai_service = get_ai_service()
    ai_service.initialize()

    result = await ai_service.generate_image(request.prompt, request.aspect_ratio)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "image_url": result["image_url"],
        "filename": result["filename"]
    }
