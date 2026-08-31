from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
from typing import Any, Protocol

from backend.models import AuthSession, ReviewRecord, Role, User, Work


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def atomic_write_json(path: Path, payload: Any) -> None:
    """Write JSON through an atomic replace so an interrupted demo stays usable."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        temporary_path = Path(handle.name)
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary_path, path)


# --------------------------------------------------------------------------
# Review Repository Interfaces & Implementations
# --------------------------------------------------------------------------

class ReviewRepository(Protocol):
    def load_reviews(self) -> dict[str, ReviewRecord]: ...
    def save_review(self, review: ReviewRecord) -> None: ...


class InMemoryReviewRepository:
    def __init__(self) -> None:
        self._reviews: dict[str, ReviewRecord] = {}

    def load_reviews(self) -> dict[str, ReviewRecord]:
        return dict(self._reviews)

    def save_review(self, review: ReviewRecord) -> None:
        self._reviews[review.flag_id] = review


class JsonRepository:
    def __init__(self, works_path: Path, reviews_path: Path | None = None) -> None:
        self.works_path = works_path
        self.reviews_path = reviews_path or works_path.with_name("reviews.json")

    def load_works(self) -> list[Work]:
        payload = read_json(self.works_path)
        records = payload["works"] if isinstance(payload, dict) else payload
        return [Work.model_validate(record) for record in records]

    def save_works(self, works: list[Work]) -> None:
        atomic_write_json(
            self.works_path,
            [work.model_dump(mode="json") for work in works],
        )

    def load_reviews(self) -> dict[str, ReviewRecord]:
        if not self.reviews_path.exists():
            return {}
        payload = read_json(self.reviews_path)
        records = payload.values() if isinstance(payload, dict) else payload
        return {
            record.flag_id: record
            for item in records
            if (record := ReviewRecord.model_validate(item))
        }

    def save_review(self, review: ReviewRecord) -> None:
        reviews = self.load_reviews()
        reviews[review.flag_id] = review
        atomic_write_json(
            self.reviews_path,
            {
                flag_id: item.model_dump(mode="json")
                for flag_id, item in sorted(reviews.items())
            },
        )


# --------------------------------------------------------------------------
# Auth & User Repository Interfaces & Implementations
# --------------------------------------------------------------------------

class AuthRepository(Protocol):
    def get_user_by_id(self, user_id: str) -> User | None: ...
    def get_user_by_email(self, email: str) -> User | None: ...
    def save_user(self, user: User) -> None: ...
    def list_users(self) -> list[User]: ...
    def get_session_by_jti(self, jti: str) -> AuthSession | None: ...
    def save_session(self, session: AuthSession) -> None: ...
    def revoke_session(self, jti: str, replaced_by: str | None = None) -> bool: ...
    def revoke_user_sessions(self, user_id: str) -> int: ...


class InMemoryAuthRepository:
    def __init__(self, initial_users: list[User] | None = None) -> None:
        self._users: dict[str, User] = {}
        self._email_to_id: dict[str, str] = {}
        self._sessions: dict[str, AuthSession] = {}
        if initial_users:
            for user in initial_users:
                self.save_user(user)

    def get_user_by_id(self, user_id: str) -> User | None:
        return self._users.get(user_id)

    def get_user_by_email(self, email: str) -> User | None:
        normalized = email.strip().lower()
        user_id = self._email_to_id.get(normalized)
        return self._users.get(user_id) if user_id else None

    def save_user(self, user: User) -> None:
        self._users[user.id] = user
        self._email_to_id[user.email.strip().lower()] = user.id

    def list_users(self) -> list[User]:
        return list(self._users.values())

    def get_session_by_jti(self, jti: str) -> AuthSession | None:
        return self._sessions.get(jti)

    def save_session(self, session: AuthSession) -> None:
        self._sessions[session.jti] = session

    def revoke_session(self, jti: str, replaced_by: str | None = None) -> bool:
        session = self._sessions.get(jti)
        if session is None or session.revoked_at is not None:
            return False
        self._sessions[jti] = AuthSession(
            id=session.id,
            user_id=session.user_id,
            jti=session.jti,
            token_hash=session.token_hash,
            created_at=session.created_at,
            expires_at=session.expires_at,
            revoked_at=datetime.now(timezone.utc),
            replaced_by=replaced_by or session.replaced_by,
            user_agent=session.user_agent,
            ip_address=session.ip_address,
        )
        return True

    def revoke_user_sessions(self, user_id: str) -> int:
        now = datetime.now(timezone.utc)
        count = 0
        for jti, session in list(self._sessions.items()):
            if session.user_id == user_id and session.revoked_at is None:
                self._sessions[jti] = AuthSession(
                    id=session.id,
                    user_id=session.user_id,
                    jti=session.jti,
                    token_hash=session.token_hash,
                    created_at=session.created_at,
                    expires_at=session.expires_at,
                    revoked_at=now,
                    replaced_by=session.replaced_by,
                    user_agent=session.user_agent,
                    ip_address=session.ip_address,
                )
                count += 1
        return count


class JsonAuthRepository:
    def __init__(
        self,
        users_path: Path,
        sessions_path: Path | None = None,
    ) -> None:
        self.users_path = users_path
        self.sessions_path = sessions_path or users_path.with_name("auth_sessions.json")
        self._ensure_seed_user()

    def _ensure_seed_user(self) -> None:
        """Seed default demo reviewer if no users exist."""
        from backend.auth import hash_password
        users = self._load_users_dict()
        if not users:
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
            users[demo_user.id] = demo_user
            self._save_users_dict(users)

    def _load_users_dict(self) -> dict[str, User]:
        if not self.users_path.exists():
            return {}
        payload = read_json(self.users_path)
        records = payload.values() if isinstance(payload, dict) else payload
        return {
            record.id: record
            for item in records
            if (record := User.model_validate(item))
        }

    def _save_users_dict(self, users: dict[str, User]) -> None:
        atomic_write_json(
            self.users_path,
            {
                uid: item.model_dump(mode="json")
                for uid, item in sorted(users.items())
            },
        )

    def _load_sessions_dict(self) -> dict[str, AuthSession]:
        if not self.sessions_path.exists():
            return {}
        payload = read_json(self.sessions_path)
        records = payload.values() if isinstance(payload, dict) else payload
        return {
            record.jti: record
            for item in records
            if (record := AuthSession.model_validate(item))
        }

    def _save_sessions_dict(self, sessions: dict[str, AuthSession]) -> None:
        atomic_write_json(
            self.sessions_path,
            {
                jti: item.model_dump(mode="json")
                for jti, item in sorted(sessions.items())
            },
        )

    def get_user_by_id(self, user_id: str) -> User | None:
        users = self._load_users_dict()
        return users.get(user_id)

    def get_user_by_email(self, email: str) -> User | None:
        normalized = email.strip().lower()
        users = self._load_users_dict()
        for user in users.values():
            if user.email.strip().lower() == normalized:
                return user
        return None

    def save_user(self, user: User) -> None:
        users = self._load_users_dict()
        users[user.id] = user
        self._save_users_dict(users)

    def list_users(self) -> list[User]:
        return list(self._load_users_dict().values())

    def get_session_by_jti(self, jti: str) -> AuthSession | None:
        sessions = self._load_sessions_dict()
        return sessions.get(jti)

    def save_session(self, session: AuthSession) -> None:
        sessions = self._load_sessions_dict()
        sessions[session.jti] = session
        self._save_sessions_dict(sessions)

    def revoke_session(self, jti: str, replaced_by: str | None = None) -> bool:
        sessions = self._load_sessions_dict()
        session = sessions.get(jti)
        if session is None or session.revoked_at is not None:
            return False
        sessions[jti] = AuthSession(
            id=session.id,
            user_id=session.user_id,
            jti=session.jti,
            token_hash=session.token_hash,
            created_at=session.created_at,
            expires_at=session.expires_at,
            revoked_at=datetime.now(timezone.utc),
            replaced_by=replaced_by or session.replaced_by,
            user_agent=session.user_agent,
            ip_address=session.ip_address,
        )
        self._save_sessions_dict(sessions)
        return True

    def revoke_user_sessions(self, user_id: str) -> int:
        sessions = self._load_sessions_dict()
        now = datetime.now(timezone.utc)
        count = 0
        for jti, session in list(sessions.items()):
            if session.user_id == user_id and session.revoked_at is None:
                sessions[jti] = AuthSession(
                    id=session.id,
                    user_id=session.user_id,
                    jti=session.jti,
                    token_hash=session.token_hash,
                    created_at=session.created_at,
                    expires_at=session.expires_at,
                    revoked_at=now,
                    replaced_by=session.replaced_by,
                    user_agent=session.user_agent,
                    ip_address=session.ip_address,
                )
                count += 1
        if count > 0:
            self._save_sessions_dict(sessions)
        return count
