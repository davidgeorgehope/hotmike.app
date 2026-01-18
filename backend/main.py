from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from user_auth import router as auth_router
from recordings import router as recordings_router
from preferences import router as preferences_router

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

@app.on_event("startup")
def startup():
    init_db()

@app.get("/api/health")
def health():
    return {"status": "ok"}
