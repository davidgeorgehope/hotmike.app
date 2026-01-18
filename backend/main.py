from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from user_auth import router as auth_router
from recordings import router as recordings_router
from preferences import router as preferences_router
from overlays import router as overlays_router
from talk_tracks import router as talk_tracks_router
from ws_transcription import router as ws_router
from config import get_ai_status

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

@app.on_event("startup")
def startup():
    init_db()

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/ai-status")
def ai_status():
    """Get AI feature availability and configuration status."""
    return get_ai_status()
