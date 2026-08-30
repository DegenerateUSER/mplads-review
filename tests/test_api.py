from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from backend.detectors.photos import perceptual_hash, variance_of_laplacian
from backend.main import create_app
from backend.models import DetectorName
from backend.repository import JsonRepository, read_json
from data.generator import DEMO_AS_OF_DATE, generate_demo_dataset
from scripts.build_demo import build_demo


DEMO_WORKS, GROUND_TRUTH = generate_demo_dataset()


def duplicate_flag_id(application) -> str:
    service = application.state.analysis
    expected_pair = frozenset(
        (
            GROUND_TRUTH["duplicate_pairs"][0]["first"],
            GROUND_TRUTH["duplicate_pairs"][0]["second"],
        )
    )
    for flag in service.flags.values():
        if (
            flag.detector == DetectorName.DUPLICATE
            and flag.related_work_id
            and frozenset((flag.work_id, flag.related_work_id)) == expected_pair
        ):
            return flag.id
    raise AssertionError("Injected duplicate pair did not produce an API flag")


def test_health_and_role_dashboard_summary() -> None:
    application = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE)
    client = TestClient(application)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["work_count"] == len(DEMO_WORKS)
    assert (
        health.json()["capabilities"]["duplicate_detection"]["default_method"]
        == "multilingual domain glossary + RapidFuzz"
    )
    assert (
        health.json()["capabilities"]["duplicate_detection"][
            "general_embeddings_default"
        ]
        is False
    )

    response = client.get(
        "/api/dashboard-summary",
        params={"role": "state", "state": "Maharashtra"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "State"
    assert payload["totals"]["works"] > 100
    assert payload["totals"]["high_risk"] >= 2
    assert payload["provenance_counts"]["synthetic"] == payload["totals"]["works"]
    assert payload["detector_counts"]["duplicate"] >= 4
    assert {item["district"] for item in payload["by_district"]} == {
        "Pune",
        "Nashik",
    }
    assert payload["audit_queue"]
    assert {"flag", "work"} <= payload["audit_queue"][0].keys()
    assert payload["totals"]["flags"] == len(payload["audit_queue"])
    assert payload["totals"]["flagged_works"] == payload["totals"]["flagged"]
    assert payload["totals"]["pending_review"] == payload["totals"]["flags"]


def test_full_dashboard_queue_is_not_truncated() -> None:
    application = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE)
    payload = TestClient(application).get("/api/dashboard-summary").json()

    assert payload["totals"]["flags"] > 50
    assert len(payload["audit_queue"]) == payload["totals"]["flags"]
    assert len({item["flag"]["id"] for item in payload["audit_queue"]}) == len(
        payload["audit_queue"]
    )


def test_evidence_endpoint_returns_side_by_side_demo_payload() -> None:
    application = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE)
    client = TestClient(application)
    flag_id = duplicate_flag_id(application)

    response = client.get(f"/api/flags/{flag_id}/evidence")
    assert response.status_code == 200
    payload = response.json()
    assert {
        "flag",
        "primary_work",
        "related_work",
        "risk",
        "signals",
        "text_matches",
        "photo_evidence",
    } == payload.keys()
    assert payload["flag"]["detector"] == "duplicate"
    assert payload["primary_work"]["source"] == "synthetic"
    assert payload["related_work"]["source"] == "synthetic"
    assert payload["signals"][0]["label"] == "Canonical text similarity"
    assert {match["field"] for match in payload["text_matches"]} == {
        "title",
        "description",
    }
    assert payload["photo_evidence"]["status"] == "flagged"
    assert sum(
        component["points"] for component in payload["risk"]["components"]
    ) == payload["risk"]["total_score"]


def test_pair_flag_is_visible_and_scored_from_either_endpoint() -> None:
    application = create_app(works=DEMO_WORKS, as_of=DEMO_AS_OF_DATE)
    client = TestClient(application)
    first = GROUND_TRUTH["duplicate_pairs"][0]["first"]
    second = GROUND_TRUTH["duplicate_pairs"][0]["second"]
    expected_flag_id = duplicate_flag_id(application)

    first_flags = client.get("/api/flags", params={"work_id": first}).json()
    second_flags = client.get("/api/flags", params={"work_id": second}).json()
    assert expected_flag_id in {flag["id"] for flag in first_flags}
    assert expected_flag_id in {flag["id"] for flag in second_flags}

    for work_id in (first, second):
        risk = client.get(f"/api/risk/{work_id}").json()
        duplicate_component = next(
            component
            for component in risk["components"]
            if component["detector"] == "duplicate"
        )
        assert expected_flag_id in duplicate_component["flag_ids"]
        assert sum(
            component["points"] for component in risk["components"]
        ) == risk["total_score"]


def test_build_generates_computed_photo_assets_and_serves_them(
    tmp_path: Path,
) -> None:
    output = tmp_path / "demo"
    works_path, ground_truth_path = build_demo(output)
    ground_truth = read_json(ground_truth_path)
    works = JsonRepository(works_path).load_works()
    work_by_id = {work.id: work for work in works}
    fixtures = sorted((output / "photos").glob("*.png"))

    assert all(work.sanctioned_date.isoformat() >= "2023-04-01" for work in works)
    assert len(fixtures) >= 24
    assert {path.stem for path in fixtures} == set(
        ground_truth["photo_fixture_work_ids"]
    )
    for path in fixtures:
        photo = work_by_id[path.stem].photo
        assert photo is not None
        assert photo.asset_url == f"/api/demo-photos/{path.name}"
        assert photo.perceptual_hash == perceptual_hash(path)
        assert photo.blur_score == pytest.approx(
            variance_of_laplacian(path),
            abs=0.001,
        )
    for work_id in ground_truth["low_quality_photo_work_ids"]:
        photo = work_by_id[work_id].photo
        assert photo is not None
        assert photo.blur_score < 80
        assert min(photo.width, photo.height) < 480

    application = create_app(
        works_path=works_path,
        as_of=DEMO_AS_OF_DATE,
    )
    client = TestClient(application)
    first_id, second_id = ground_truth["photo_reuse_pairs"][0]
    photo_flag = next(
        flag
        for flag in application.state.analysis.flags.values()
        if (
            flag.detector == DetectorName.PHOTO
            and frozenset((flag.work_id, flag.related_work_id))
            == frozenset((first_id, second_id))
        )
    )
    evidence = client.get(f"/api/flags/{photo_flag.id}/evidence").json()
    assert evidence["photo_evidence"]["primary_url"]
    assert evidence["photo_evidence"]["related_url"]
    assert (
        evidence["photo_evidence"]["hash_distance"]
        <= evidence["photo_evidence"]["maximum_hash_distance"]
    )
    assert (
        evidence["photo_evidence"]["threshold_details"]["metrics_source"]
        == "computed local PNG assets"
    )

    for key in ("primary_url", "related_url"):
        response = client.get(evidence["photo_evidence"][key])
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_review_workflow_persists_and_supports_frontend_patch(
    tmp_path: Path,
) -> None:
    repository = JsonRepository(
        tmp_path / "works.json",
        tmp_path / "reviews.json",
    )
    application = create_app(
        works=DEMO_WORKS,
        as_of=DEMO_AS_OF_DATE,
        review_repository=repository,
    )
    client = TestClient(application)
    flag_id = duplicate_flag_id(application)

    response = client.post(
        f"/api/flags/{flag_id}/review",
        json={
            "review_status": "reviewed",
            "reviewer": "District demo reviewer",
            "notes": "Records compared; retain for follow-up.",
        },
    )
    assert response.status_code == 200
    assert response.json()["review_status"] == "reviewed"
    assert response.json()["review"]["reviewer"] == "District demo reviewer"
    assert repository.reviews_path.exists()

    reloaded_application = create_app(
        works=DEMO_WORKS,
        as_of=DEMO_AS_OF_DATE,
        review_repository=repository,
    )
    reloaded_client = TestClient(reloaded_application)
    evidence = reloaded_client.get(f"/api/flags/{flag_id}/evidence").json()
    assert evidence["flag"]["review_status"] == "reviewed"

    patch_response = reloaded_client.patch(
        f"/api/flags/{flag_id}/review",
        json={"review_status": "disputed"},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["review_status"] == "disputed"
