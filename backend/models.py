from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class Provenance(str, Enum):
    SYNTHETIC = "synthetic"
    REAL_SCRAPED = "real_scraped"
    MANUALLY_COMPILED = "manually_compiled"


class WorkStatus(str, Enum):
    SANCTIONED = "Sanctioned"
    ONGOING = "Ongoing"
    COMPLETED = "Completed"
    LAPSED = "Lapsed"


class Category(str, Enum):
    ROAD = "Road"
    BUILDING = "Building"
    WATER = "Water"
    SANITATION = "Sanitation"
    EDUCATION = "Education"
    HEALTH = "Health"
    ELECTRIFICATION = "Electrification"
    OTHER = "Other"


class DetectorName(str, Enum):
    DUPLICATE = "duplicate"
    COST_OUTLIER = "cost_outlier"
    STALL = "stall"
    PHOTO = "photo"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class RiskTier(str, Enum):
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


class ReviewStatus(str, Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    DISPUTED = "disputed"
    DISMISSED = "dismissed"
    NEEDS_FOLLOW_UP = "needs_follow_up"


class Role(str, Enum):
    MP = "MP"
    STATE = "State"
    DISTRICT = "District"
    MINISTRY = "Ministry"


class PhotoMetadata(StrictModel):
    photo_id: str
    perceptual_hash: str | None = None
    blur_score: float | None = Field(default=None, ge=0)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    captured_date: date | None = None
    placeholder: bool = False
    asset_url: str | None = None
    source_note: str = "Synthetic completion-photo metadata"


class Work(StrictModel):
    id: str
    title: str
    description: str
    state: str
    district: str
    constituency: str
    mp_name: str
    category: Category
    sanction_amount: float = Field(ge=0)
    quantity: float = Field(default=1.0, gt=0)
    unit: str = Field(default="work", min_length=1, max_length=40)
    expenditure: float = Field(ge=0)
    status: WorkStatus
    sanctioned_date: date
    last_progress_date: date | None = None
    progress_percent: float = Field(ge=0, le=100)
    source: Provenance = Provenance.SYNTHETIC
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    risk_score: int = Field(default=0, ge=0, le=100)
    risk_tier: RiskTier = RiskTier.GREEN
    financial_year: str
    implementing_agency: str = "District Authority (synthetic)"
    is_continuation: bool = False
    parent_work_id: str | None = None
    photo: PhotoMetadata | None = None

    @model_validator(mode="before")
    @classmethod
    def accept_serialized_unit_cost(cls, value: Any) -> Any:
        """Treat unit_cost as derived even when loading a serialized Work."""
        if isinstance(value, dict) and "unit_cost" in value:
            value = dict(value)
            value.pop("unit_cost")
        return value

    @model_validator(mode="after")
    def continuation_has_parent(self) -> Work:
        if self.is_continuation and not self.parent_work_id:
            raise ValueError("Continuation works must identify parent_work_id")
        return self

    @computed_field(return_type=float)
    @property
    def unit_cost(self) -> float:
        return round(self.sanction_amount / self.quantity, 2)


class Flag(StrictModel):
    id: str
    work_id: str
    detector: DetectorName
    severity: Severity
    points: int = Field(ge=0, le=100)
    summary: str
    related_work_id: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    review_status: ReviewStatus = ReviewStatus.PENDING
    review: dict[str, Any] | None = None


class ScoreComponent(StrictModel):
    detector: DetectorName
    points: int = Field(ge=0, le=100)
    maximum_points: int = Field(ge=0, le=100)
    flag_ids: list[str]
    explanation: str


class RiskScore(StrictModel):
    work_id: str
    total_score: int = Field(ge=0, le=100)
    tier: RiskTier
    components: list[ScoreComponent]
    explanation: str


class TextMatch(StrictModel):
    field: str
    primary_text: str
    related_text: str
    common_terms: list[str]
    similarity: float = Field(ge=0, le=1)


class EvidenceSignal(StrictModel):
    label: str
    value: str
    points: int = Field(default=0, ge=0, le=100)
    explanation: str


class EvidencePayload(StrictModel):
    flag: Flag
    primary_work: Work
    related_work: Work | None = None
    risk: RiskScore
    signals: list[EvidenceSignal] = Field(default_factory=list)
    text_matches: list[TextMatch] = Field(default_factory=list)
    photo_evidence: dict[str, Any] | None = None


class ReviewRequest(StrictModel):
    review_status: ReviewStatus
    reviewer: str = Field(default="Demo reviewer", min_length=2, max_length=100)
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def cannot_submit_pending_review(self) -> ReviewRequest:
        if self.review_status == ReviewStatus.PENDING:
            raise ValueError("A submitted review must move the flag out of pending")
        return self


class ReviewRecord(StrictModel):
    flag_id: str
    review_status: ReviewStatus
    reviewer: str
    notes: str
    reviewed_at: datetime


class User(StrictModel):
    id: str
    email: str
    password_hash: str
    role: Role = Role.MINISTRY
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class SafeUser(StrictModel):
    id: str
    email: str
    role: Role = Role.MINISTRY
    is_active: bool = True
    created_at: datetime


class AuthSession(StrictModel):
    id: str
    user_id: str
    jti: str
    token_hash: str
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    replaced_by: str | None = None
    user_agent: str | None = None
    ip_address: str | None = None


class SignupRequest(StrictModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: Role | None = None


class LoginRequest(StrictModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(StrictModel):
    access_token: str
    token_type: str = "bearer"
    user: SafeUser | None = None

