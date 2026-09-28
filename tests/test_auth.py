from __future__ import annotations

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import jwt
import pytest

from backend.auth import (
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
    REFRESH_COOKIE_NAME,
    create_access_token,
    create_refresh_token,
    hash_password,
)
from backend.main import create_app
from backend.models import Role, User
from backend.repository import InMemoryAuthRepository
from data.generator import DEMO_AS_OF_DATE, generate_demo_dataset


DEMO_WORKS, _ = generate_demo_dataset()


def test_public_health_endpoints_remain_accessible() -> None:
    app = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE)
    client = TestClient(app)

    res1 = client.get("/health")
    assert res1.status_code == 200
    assert res1.json()["status"] == "ok"

    res2 = client.get("/api/health")
    assert res2.status_code == 200
    assert res2.json()["status"] == "ok"


def test_protected_endpoints_reject_anonymous_or_invalid_tokens() -> None:
    app = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE)
    client = TestClient(app)

    # 1. No token -> 401
    res = client.get("/api/works")
    assert res.status_code == 401
    assert "Not authenticated" in res.json()["detail"]

    res_dash = client.get("/api/dashboard-summary")
    assert res_dash.status_code == 401

    # 2. Invalid signature -> 401
    res_inv = client.get(
        "/api/works",
        headers={"Authorization": "Bearer invalid.token.value"},
    )
    assert res_inv.status_code == 401

    # 3. Wrong token type (refresh token used as access token) -> 401
    now = datetime.now(timezone.utc)
    user = User(
        id="usr_test_type",
        email="test_type@example.com",
        password_hash=hash_password("Password123"),
        role=Role.MINISTRY,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    refresh_jwt, _ = create_refresh_token(user, jti="test_jti")
    res_type = client.get(
        "/api/works",
        headers={"Authorization": f"Bearer {refresh_jwt}"},
    )
    assert res_type.status_code == 401
    assert "Invalid token type" in res_type.json()["detail"]


def test_signup_successful_and_validation_errors() -> None:
    auth_repo = InMemoryAuthRepository()
    app = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE, auth_repository=auth_repo)
    client = TestClient(app)

    # 1. Successful Signup
    res = client.post(
        "/auth/signup",
        json={"email": "Audit.Officer@MPLADS.gov.in", "password": "SecurePassword123"},
    )
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "audit.officer@mplads.gov.in"
    assert "password_hash" not in data["user"]
    assert REFRESH_COOKIE_NAME in res.cookies

    # 2. Duplicate email -> 409
    res_dup = client.post(
        "/auth/signup",
        json={"email": "audit.officer@mplads.gov.in", "password": "AnotherPassword123"},
    )
    assert res_dup.status_code == 409
    assert "already exists" in res_dup.json()["detail"]

    # 3. Invalid email -> 422
    res_invalid_email = client.post(
        "/auth/signup",
        json={"email": "not-an-email", "password": "SecurePassword123"},
    )
    assert res_invalid_email.status_code == 422

    # 4. Weak password (< 8 chars or missing digits) -> 422
    res_short_pwd = client.post(
        "/auth/signup",
        json={"email": "officer2@mplads.gov.in", "password": "short"},
    )
    assert res_short_pwd.status_code == 422

    res_no_num_pwd = client.post(
        "/auth/signup",
        json={"email": "officer2@mplads.gov.in", "password": "purelettersonly"},
    )
    assert res_no_num_pwd.status_code == 422


def test_login_success_and_failures() -> None:
    now = datetime.now(timezone.utc)
    user = User(
        id="usr_audit_chief",
        email="chief@mplads.gov.in",
        password_hash=hash_password("ChiefPass123"),
        role=Role.MINISTRY,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    auth_repo = InMemoryAuthRepository(initial_users=[user])
    app = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE, auth_repository=auth_repo)
    client = TestClient(app)

    # 1. Successful Login
    res = client.post(
        "/auth/login",
        json={"email": "Chief@mplads.gov.in", "password": "ChiefPass123"},
    )
    assert res.status_code == 200
    payload = res.json()
    assert "access_token" in payload
    assert payload["user"]["email"] == "chief@mplads.gov.in"
    assert REFRESH_COOKIE_NAME in res.cookies

    # 2. Incorrect Password -> 401
    res_bad_pw = client.post(
        "/auth/login",
        json={"email": "chief@mplads.gov.in", "password": "WrongPassword123"},
    )
    assert res_bad_pw.status_code == 401

    # 3. Nonexistent Account -> 401
    res_unknown = client.post(
        "/auth/login",
        json={"email": "nobody@mplads.gov.in", "password": "SomePassword123"},
    )
    assert res_unknown.status_code == 401


def test_access_token_and_auth_me_and_protected_apis() -> None:
    app = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE)
    client = TestClient(app)

    # Login with default seeded reviewer
    login_res = client.post(
        "/auth/login",
        json={"email": "reviewer@mplads.gov.in", "password": "Reviewer@1234"},
    )
    assert login_res.status_code == 200
    access_token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # /auth/me
    me_res = client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "reviewer@mplads.gov.in"
    assert me_res.json()["is_active"] is True

    # /api/dashboard-summary
    dash_res = client.get("/api/dashboard-summary", headers=headers)
    assert dash_res.status_code == 200
    assert dash_res.json()["totals"]["works"] > 100

    # /api/works
    works_res = client.get("/api/works?limit=10", headers=headers)
    assert works_res.status_code == 200
    assert len(works_res.json()) == 10


def test_expired_access_token_rejected() -> None:
    app = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE)
    client = TestClient(app)

    now = datetime.now(timezone.utc)
    expired_time = now - timedelta(minutes=5)
    expired_payload = {
        "sub": "usr_demo_reviewer",
        "email": "reviewer@mplads.gov.in",
        "role": "Ministry",
        "type": "access",
        "iat": int((now - timedelta(minutes=20)).timestamp()),
        "exp": int(expired_time.timestamp()),
    }
    expired_token = jwt.encode(expired_payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    res = client.get("/api/works", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401
    assert "Token has expired" in res.json()["detail"]


def test_refresh_token_rotation_and_revocation() -> None:
    auth_repo = InMemoryAuthRepository()
    app = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE, auth_repository=auth_repo)
    client = TestClient(app)

    # Signup
    signup_res = client.post(
        "/auth/signup",
        json={"email": "rotate@mplads.gov.in", "password": "RotatePassword123"},
    )
    assert signup_res.status_code == 201
    old_refresh_cookie = signup_res.cookies.get(REFRESH_COOKIE_NAME)
    assert old_refresh_cookie is not None

    # Call /auth/refresh
    refresh_res = client.post("/auth/refresh")
    assert refresh_res.status_code == 200
    new_data = refresh_res.json()
    assert "access_token" in new_data
    new_refresh_cookie = refresh_res.cookies.get(REFRESH_COOKIE_NAME)
    assert new_refresh_cookie is not None
    assert new_refresh_cookie != old_refresh_cookie

    # Attempting to use old refresh token (Reuse Detection!) -> All user sessions invalidated!
    client_reuse = TestClient(app)
    client_reuse.cookies.set(REFRESH_COOKIE_NAME, old_refresh_cookie)
    reuse_res = client_reuse.post("/auth/refresh")
    assert reuse_res.status_code == 401
    assert "revoked" in reuse_res.json()["detail"]

    # Now the rotated token should also be revoked due to reuse detection
    client_legit = TestClient(app)
    client_legit.cookies.set(REFRESH_COOKIE_NAME, new_refresh_cookie)
    legit_res = client_legit.post("/auth/refresh")
    assert legit_res.status_code == 401


def test_logout_revokes_session_and_clears_cookie() -> None:
    auth_repo = InMemoryAuthRepository()
    app = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE, auth_repository=auth_repo)
    client = TestClient(app)

    # Signup
    signup_res = client.post(
        "/auth/signup",
        json={"email": "logout_test@mplads.gov.in", "password": "LogoutPassword123"},
    )
    assert signup_res.status_code == 201
    refresh_cookie = signup_res.cookies.get(REFRESH_COOKIE_NAME)

    # Logout
    logout_res = client.post("/auth/logout")
    assert logout_res.status_code == 200
    assert logout_res.json()["message"] == "Logged out successfully"

    # Refresh after logout -> 401
    client.cookies.set(REFRESH_COOKIE_NAME, refresh_cookie)
    ref_res = client.post("/auth/refresh")
    assert ref_res.status_code == 401

    # Idempotent logout
    logout_again = client.post("/auth/logout")
    assert logout_again.status_code == 200
