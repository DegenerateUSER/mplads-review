from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import re
import secrets
from typing import Any

from fastapi import HTTPException, status
import jwt

from backend.models import Role, SafeUser, User


# --------------------------------------------------------------------------
# Configuration from Environment
# --------------------------------------------------------------------------

JWT_SECRET_KEY = os.environ.get(
    "JWT_SECRET_KEY",
    "dev-secret-key-mplads-workbench-change-in-production-f89a71b3e2",
)
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() in ("true", "1", "yes") or (
    ENVIRONMENT == "production"
)
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")
REFRESH_COOKIE_NAME = "mplads_refresh_token"

PBKDF2_ITERATIONS = 600_000
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


# --------------------------------------------------------------------------
# Password Hashing & Verification (PBKDF2-HMAC-SHA256)
# --------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with cryptographically secure random salt."""
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${key.hex()}"


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify password against stored hash with constant-time comparison."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = bytes.fromhex(parts[2])
        expected_key = bytes.fromhex(parts[3])
        calculated_key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
        )
        return hmac.compare_digest(calculated_key, expected_key)
    except Exception:
        return False


def validate_password_strength(password: str) -> None:
    """Ensure password meets minimum institutional security standards."""
    if len(password) < 8:
        raise HTTPException(
            status_code=422,
            detail="Password must be at least 8 characters long",
        )
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        raise HTTPException(
            status_code=422,
            detail="Password must contain at least one letter and one number",
        )


def normalize_email(email: str) -> str:
    """Normalize and format check user email address."""
    email_clean = email.strip().lower()
    if not EMAIL_REGEX.match(email_clean):
        raise HTTPException(
            status_code=422,
            detail="Invalid email address format",
        )
    return email_clean


def hash_token(raw_token: str) -> str:
    """Hash raw token with SHA-256 so raw refresh tokens are never stored in plaintext."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# JWT Token Generation & Validation
# --------------------------------------------------------------------------

def create_access_token(
    user: User,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expires = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload: dict[str, Any] = {
        "sub": user.id,
        "email": user.email,
        "role": user.role.value,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(
    user: User,
    jti: str,
    expires_delta: timedelta | None = None,
) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires = now + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    payload: dict[str, Any] = {
        "sub": user.id,
        "jti": jti,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    raw_jwt = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return raw_jwt, expires


def decode_jwt(token: str, expected_type: str) -> dict[str, Any]:
    """Decode and validate a JWT for signature, expiration, and expected type."""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature or format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_type = payload.get("type")
    if token_type != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token type: expected {expected_type}, received {token_type}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def to_safe_user(user: User) -> SafeUser:
    """Convert internal User model to safe public representation."""
    return SafeUser(
        id=user.id,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
    )
