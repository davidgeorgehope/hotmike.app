from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from database import get_db
from auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

class SignupRequest(BaseModel):
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    token: str
    user: dict

class UserResponse(BaseModel):
    id: int
    email: str

@router.post("/signup", response_model=AuthResponse)
def signup(request: SignupRequest):
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE email = ?", (request.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")

        hashed = hash_password(request.password)
        cursor.execute(
            "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
            (request.email, hashed)
        )
        user_id = cursor.lastrowid

        cursor.execute(
            "INSERT INTO user_preferences (user_id) VALUES (?)",
            (user_id,)
        )

        token = create_access_token(user_id, request.email)
        return {
            "token": token,
            "user": {"id": user_id, "email": request.email}
        }

@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, email, hashed_password FROM users WHERE email = ?",
            (request.email,)
        )
        row = cursor.fetchone()

        if not row or not verify_password(request.password, row["hashed_password"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = create_access_token(row["id"], row["email"])
        return {
            "token": token,
            "user": {"id": row["id"], "email": row["email"]}
        }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
