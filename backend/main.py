from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.analysis import AnalysisService
from backend.detectors.duplicate import DEFAULT_DUPLICATE_METHOD
from backend.models import (
    EvidencePayload,
    Flag,
    ReviewRequest,
    RiskScore,
    Role,
    Work,
)
from backend.repository import (
    InMemoryReviewRepository,
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
) -> FastAPI:
    data_path = works_path or DEFAULT_WORKS_PATH
    if works is None:
        _ensure_default_dataset(data_path)
        repository = JsonRepository(data_path)
        work_records = repository.load_works()
        reviews = review_repository or repository
    else:
        work_records = list(works)
        reviews = review_repository or InMemoryReviewRepository()

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
            "Demo records are explicitly provenance-labelled."
        ),
    )
    application.state.analysis = service
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
    )

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

    @application.get("/api/works", response_model=list[Work], tags=["works"])
    def list_works(
        state: str | None = None,
        district: str | None = None,
        mp: str | None = None,
        category: str | None = None,
        status: str | None = None,
        risk_tier: str | None = None,
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=1000, ge=1, le=5000),
    ) -> list[Work]:
        records = service.list_works(
            state=state,
            district=district,
            mp=mp,
            category=category,
            status=status,
            risk_tier=risk_tier,
        )
        return records[offset : offset + limit]

    @application.get(
        "/api/works/{work_id}",
        response_model=Work,
        tags=["works"],
    )
    def get_work(work_id: str) -> Work:
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
    def get_risk(work_id: str) -> RiskScore:
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
    def flag_evidence(flag_id: str) -> EvidencePayload:
        evidence = service.evidence_for_flag(flag_id)
        if evidence is None:
            raise HTTPException(status_code=404, detail="Flag not found")
        return evidence

    def submit_review(flag_id: str, request: ReviewRequest) -> Flag:
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
