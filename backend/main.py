from __future__ import annotations

import os
from datetime import date
from datetime import date, datetime, timezone
from pathlib import Path
import secrets
from typing import Iterable

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

from backend.analysis import AnalysisService
from backend.auth import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_jwt,
    hash_password,
    hash_token,
    normalize_email,
    to_safe_user,
    validate_password_strength,
    verify_password,
)
from backend.detectors.duplicate import DEFAULT_DUPLICATE_METHOD
from backend.models import (
    AuthSession,
    EvidencePayload,
    Flag,
    LoginRequest,
    ReviewRequest,
    RiskScore,
    Role,
    SafeUser,
    SignupRequest,
    TokenResponse,
    User,
    Work,
)
from backend.repository import (
    AuthRepository,
    InMemoryAuthRepository,
    InMemoryReviewRepository,
    JsonAuthRepository,
    JsonRepository,
    ReviewRepository,
    atomic_write_json,
)
from data.generator import DEMO_AS_OF_DATE, generate_demo_dataset


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(Path(__file__).resolve().parent / ".env")

DEFAULT_WORKS_PATH = PROJECT_ROOT / "data" / "demo" / "works.json"
DEFAULT_PHOTOS_PATH = PROJECT_ROOT / "data" / "demo" / "photos"


def _parse_role(value: str) -> Role:
    normalised = value.strip().casefold()
    aliases = {
        "mp": Role.MP,
        "member of parliament": Role.MP,
        "state": Role.STATE,
        "district": Role.DISTRICT,
        "ministry": Role.MINISTRY,
        "mospi": Role.MINISTRY,
    }
    role = aliases.get(normalised)
    if role is None:
        allowed = ", ".join(item.value for item in Role)
        raise HTTPException(
            status_code=422,
            detail=f"role must be one of: {allowed}",
        )
    return role


def _ensure_default_dataset(path: Path) -> None:
    if path.exists():
        return
    works, ground_truth = generate_demo_dataset(as_of=DEMO_AS_OF_DATE)
    atomic_write_json(path, [work.model_dump(mode="json") for work in works])
    atomic_write_json(path.with_name("ground_truth.json"), ground_truth)


def create_app(
    *,
    works: Iterable[Work] | None = None,
    works_path: Path | None = None,
    photos_path: Path | None = None,
    as_of: date = DEMO_AS_OF_DATE,
    review_repository: ReviewRepository | None = None,
    auth_repository: AuthRepository | None = None,
) -> FastAPI:
    data_path = works_path or DEFAULT_WORKS_PATH
    if works is None:
        _ensure_default_dataset(data_path)
        repository = JsonRepository(data_path)
        work_records = repository.load_works()
        reviews = review_repository or repository
        auth_repo = auth_repository or JsonAuthRepository(
            data_path.parent / "users.json",
            data_path.parent / "auth_sessions.json",
        )
    else:
        work_records = list(works)
        reviews = review_repository or InMemoryReviewRepository()
        if auth_repository is not None:
            auth_repo = auth_repository
        else:
            now = datetime.now(timezone.utc)
            demo_user = User(
                id="usr_demo_reviewer",
                email="reviewer@mplads.gov.in",
                password_hash=hash_password("Reviewer@1234"),
                role=Role.MINISTRY,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            auth_repo = InMemoryAuthRepository(initial_users=[demo_user])

    service = AnalysisService(
        work_records,
        as_of=as_of,
        review_repository=reviews,
    )
    application = FastAPI(
        title="MPLADS Anomaly Review API",
        version="0.1.0",
        description=(
            "Local-first, explainable review and decision-support API. "
            "Protected endpoints require JWT Bearer access token."
        ),
    )
    application.state.analysis = service
    application.state.auth_repository = auth_repo

    photo_directory = photos_path or (
        data_path.parent / "photos"
        if works_path is not None
        else DEFAULT_PHOTOS_PATH
    )
    if photo_directory.is_dir():
        application.mount(
            "/api/demo-photos",
            StaticFiles(directory=photo_directory),
            name="demo-photos",
        )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[os.environ["FRONTEND_URL"].rstrip("/")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    oauth2_scheme = HTTPBearer(auto_error=False)

    async def get_current_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(oauth2_scheme),
    ) -> User:
        if not credentials or credentials.scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        payload = decode_jwt(credentials.credentials, expected_type="access")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token subject",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user = auth_repo.get_user_by_id(user_id)
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive or not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    def set_refresh_cookie(response: Response, refresh_token: str) -> None:
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=refresh_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
            path="/",
        )

    def clear_refresh_cookie(response: Response) -> None:
        response.delete_cookie(
            key=REFRESH_COOKIE_NAME,
            path="/",
            samesite=COOKIE_SAMESITE,
            secure=COOKIE_SECURE,
        )

    # --------------------------------------------------------------------------
    # Public Authentication Endpoints
    # --------------------------------------------------------------------------

    def register_auth_routes(prefix: str = "/auth") -> None:
        @application.post(
            f"{prefix}/signup",
            response_model=TokenResponse,
            status_code=status.HTTP_201_CREATED,
            tags=["auth"],
        )
        def signup(
            payload: SignupRequest,
            request: Request,
            response: Response,
        ) -> TokenResponse:
            normalized_email = normalize_email(payload.email)
            validate_password_strength(payload.password)

            existing_user = auth_repo.get_user_by_email(normalized_email)
            if existing_user is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email address already exists",
                )

            now = datetime.now(timezone.utc)
            user = User(
                id=f"usr_{secrets.token_hex(8)}",
                email=normalized_email,
                password_hash=hash_password(payload.password),
                role=payload.role or Role.MINISTRY,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            auth_repo.save_user(user)

            jti = secrets.token_hex(16)
            access_token = create_access_token(user)
            refresh_token, expires_at = create_refresh_token(user, jti=jti)

            session = AuthSession(
                id=f"sess_{secrets.token_hex(8)}",
                user_id=user.id,
                jti=jti,
                token_hash=hash_token(refresh_token),
                created_at=now,
                expires_at=expires_at,
                user_agent=request.headers.get("user-agent"),
                ip_address=request.client.host if request.client else None,
            )
            auth_repo.save_session(session)
            set_refresh_cookie(response, refresh_token)

            return TokenResponse(
                access_token=access_token,
                token_type="bearer",
                user=to_safe_user(user),
            )

        @application.post(
            f"{prefix}/login",
            response_model=TokenResponse,
            tags=["auth"],
        )
        def login(
            payload: LoginRequest,
            request: Request,
            response: Response,
        ) -> TokenResponse:
            normalized_email = payload.email.strip().lower()
            user = auth_repo.get_user_by_email(normalized_email)

            if user is None or not verify_password(payload.password, user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password",
                )

            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is deactivated",
                )

            now = datetime.now(timezone.utc)
            jti = secrets.token_hex(16)
            access_token = create_access_token(user)
            refresh_token, expires_at = create_refresh_token(user, jti=jti)

            session = AuthSession(
                id=f"sess_{secrets.token_hex(8)}",
                user_id=user.id,
                jti=jti,
                token_hash=hash_token(refresh_token),
                created_at=now,
                expires_at=expires_at,
                user_agent=request.headers.get("user-agent"),
                ip_address=request.client.host if request.client else None,
            )
            auth_repo.save_session(session)
            set_refresh_cookie(response, refresh_token)

            return TokenResponse(
                access_token=access_token,
                token_type="bearer",
                user=to_safe_user(user),
            )

        @application.post(
            f"{prefix}/refresh",
            response_model=TokenResponse,
            tags=["auth"],
        )
        def refresh(
            request: Request,
            response: Response,
        ) -> TokenResponse:
            raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
            if not raw_token:
                # Fallback to Authorization header if client sent Bearer refresh token
                auth_hdr = request.headers.get("Authorization", "")
                if auth_hdr.startswith("Bearer "):
                    raw_token = auth_hdr[7:].strip()

            if not raw_token:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Missing refresh token cookie",
                )

            payload = decode_jwt(raw_token, expected_type="refresh")
            user_id = payload.get("sub")
            jti = payload.get("jti")

            if not user_id or not jti:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid refresh token claims",
                )

            session = auth_repo.get_session_by_jti(jti)
            if session is None or session.token_hash != hash_token(raw_token):
                clear_refresh_cookie(response)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh session not found or invalid",
                )

            # Check if this token was already revoked (Reuse Detection!)
            if session.revoked_at is not None:
                auth_repo.revoke_user_sessions(user_id)
                clear_refresh_cookie(response)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token already used or revoked; all sessions invalidated",
                )

            now = datetime.now(timezone.utc)
            if session.expires_at < now:
                auth_repo.revoke_session(jti)
                clear_refresh_cookie(response)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token expired",
                )

            user = auth_repo.get_user_by_id(user_id)
            if user is None or not user.is_active:
                auth_repo.revoke_session(jti)
                clear_refresh_cookie(response)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User account inactive or deleted",
                )

            # Rotate refresh token: revoke current session, issue new one
            new_jti = secrets.token_hex(16)
            auth_repo.revoke_session(jti, replaced_by=new_jti)

            new_access_token = create_access_token(user)
            new_refresh_token, new_expires_at = create_refresh_token(user, jti=new_jti)

            new_session = AuthSession(
                id=f"sess_{secrets.token_hex(8)}",
                user_id=user.id,
                jti=new_jti,
                token_hash=hash_token(new_refresh_token),
                created_at=now,
                expires_at=new_expires_at,
                user_agent=request.headers.get("user-agent"),
                ip_address=request.client.host if request.client else None,
            )
            auth_repo.save_session(new_session)
            set_refresh_cookie(response, new_refresh_token)

            return TokenResponse(
                access_token=new_access_token,
                token_type="bearer",
                user=to_safe_user(user),
            )

        @application.post(
            f"{prefix}/logout",
            tags=["auth"],
        )
        def logout(
            request: Request,
            response: Response,
        ) -> dict[str, str]:
            raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
            if raw_token:
                try:
                    payload = decode_jwt(raw_token, expected_type="refresh")
                    jti = payload.get("jti")
                    if jti:
                        auth_repo.revoke_session(jti)
                except Exception:
                    pass
            clear_refresh_cookie(response)
            return {"message": "Logged out successfully"}

        @application.get(
            f"{prefix}/me",
            response_model=SafeUser,
            tags=["auth"],
        )
        def get_me(current_user: User = Depends(get_current_user)) -> SafeUser:
            return to_safe_user(current_user)

    # Register auth routes on both /auth and /api/auth
    register_auth_routes("/auth")
    register_auth_routes("/api/auth")

    # --------------------------------------------------------------------------
    # Public System Health Endpoints
    # --------------------------------------------------------------------------

    def health_payload() -> dict[str, object]:
        return {
            "status": "ok",
            "service": "mplads-anomaly-review",
            "mode": "local-first",
            "work_count": len(service.works),
            "flag_count": len(service.flags),
            "as_of_date": service.as_of.isoformat(),
            "provenance": "Record-level source labels are preserved.",
            "capabilities": {
                "duplicate_detection": {
                    "default_method": DEFAULT_DUPLICATE_METHOD,
                    "general_embeddings_default": False,
                    "embeddings": (
                        "Optional and lazy-loaded only when explicitly enabled."
                    ),
                }
            },
        }

    @application.get("/health", tags=["system"])
    def health() -> dict[str, object]:
        return health_payload()

    @application.get("/api/health", tags=["system"], include_in_schema=False)
    def api_health() -> dict[str, object]:
        return health_payload()

    # --------------------------------------------------------------------------
    # Protected Review Workbench APIs
    # --------------------------------------------------------------------------

    @application.get("/api/works", response_model=list[Work], tags=["works"])
    def list_works(
        state: str | None = None,
        district: str | None = None,
        mp: str | None = None,
        category: str | None = None,
        status_filter: str | None = Query(default=None, alias="status"),
        risk_tier: str | None = None,
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=1000, ge=1, le=5000),
        current_user: User = Depends(get_current_user),
    ) -> list[Work]:
        records = service.list_works(
            state=state,
            district=district,
            mp=mp,
            category=category,
            status=status_filter,
            risk_tier=risk_tier,
        )
        return records[offset : offset + limit]

    @application.get(
        "/api/works/{work_id}",
        response_model=Work,
        tags=["works"],
    )
    def get_work(
        work_id: str,
        current_user: User = Depends(get_current_user),
    ) -> Work:
        work = service.get_work(work_id)
        if work is None:
            raise HTTPException(status_code=404, detail="Work not found")
        return work

    @application.get("/api/flags", response_model=list[Flag], tags=["flags"])
    def list_flags(
        detector: str | None = None,
        severity: str | None = None,
        review_status: str | None = None,
        work_id: str | None = None,
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=1000, ge=1, le=5000),
        current_user: User = Depends(get_current_user),
    ) -> list[Flag]:
        work_ids = {work_id} if work_id else None
        records = service.list_flags(
            detector=detector,
            severity=severity,
            review_status=review_status,
            work_ids=work_ids,
        )
        return records[offset : offset + limit]

    @application.get(
        "/api/risk/{work_id}",
        response_model=RiskScore,
        tags=["risk"],
    )
    def get_risk(
        work_id: str,
        current_user: User = Depends(get_current_user),
    ) -> RiskScore:
        score = service.get_score(work_id)
        if score is None:
            raise HTTPException(status_code=404, detail="Work not found")
        return score

    @application.get("/api/dashboard-summary", tags=["dashboard"])
    def dashboard_summary(
        role: str = "Ministry",
        state: str | None = None,
        district: str | None = None,
        mp: str | None = None,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, object]:
        parsed_role = _parse_role(role)
        scoped_candidates = service.list_works(
            state=state,
            district=district,
            mp=mp,
        )
        anchor = scoped_candidates[0] if scoped_candidates else None
        if anchor is not None:
            if parsed_role == Role.STATE and state is None:
                state = anchor.state
            elif parsed_role == Role.DISTRICT and district is None:
                state = state or anchor.state
                district = anchor.district
            elif parsed_role == Role.MP and mp is None:
                state = state or anchor.state
                district = district or anchor.district
                mp = anchor.mp_name
        return service.dashboard_summary(
            role=parsed_role,
            state=state,
            district=district,
            mp=mp,
        )

    @application.get(
        "/api/flags/{flag_id}/evidence",
        response_model=EvidencePayload,
        tags=["flags"],
    )
    def flag_evidence(
        flag_id: str,
        current_user: User = Depends(get_current_user),
    ) -> EvidencePayload:
        evidence = service.evidence_for_flag(flag_id)
        if evidence is None:
            raise HTTPException(status_code=404, detail="Flag not found")
        return evidence

    def submit_review(
        flag_id: str,
        request: ReviewRequest,
        current_user: User = Depends(get_current_user),
    ) -> Flag:
        # Attribute review to the authenticated user if reviewer is default
        if request.reviewer == "Demo reviewer" and current_user.email:
            request = ReviewRequest(
                review_status=request.review_status,
                reviewer=current_user.email,
                notes=request.notes,
            )
        flag = service.review_flag(flag_id, request)
        if flag is None:
            raise HTTPException(status_code=404, detail="Flag not found")
        return flag

    application.post(
        "/api/flags/{flag_id}/review",
        response_model=Flag,
        tags=["flags"],
    )(submit_review)
    application.patch(
        "/api/flags/{flag_id}/review",
        response_model=Flag,
        tags=["flags"],
        include_in_schema=False,
    )(submit_review)

    return application


app = create_app()
