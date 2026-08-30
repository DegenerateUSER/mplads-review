from __future__ import annotations

from datetime import date

from PIL import Image, ImageDraw, ImageFilter

from backend.analysis import AnalysisService
from backend.detectors.cost import CostOutlierDetector, median_and_mad
from backend.detectors.duplicate import (
    DuplicateDetector,
    evaluate_continuation_exemption,
)
from backend.detectors.photos import (
    PhotoMetadataDetector,
    hamming_distance,
    perceptual_hash,
    variance_of_laplacian,
)
from backend.detectors.stalls import StallDetector
from backend.models import (
    Category,
    DetectorName,
    Flag,
    PhotoMetadata,
    Provenance,
    ReviewStatus,
    Role,
    RiskTier,
    Severity,
    Work,
    WorkStatus,
)
from backend.scoring import risk_tier, score_flags, score_works


def make_work(work_id: str, **overrides: object) -> Work:
    values: dict[str, object] = {
        "id": work_id,
        "title": f"Distinct work {work_id}",
        "description": f"Synthetic test record {work_id}",
        "state": "Test State",
        "district": "Test District",
        "constituency": "Test Constituency",
        "mp_name": "Demo MP",
        "category": Category.BUILDING,
        "sanction_amount": 1_000_000,
        "quantity": 100,
        "unit": "square_metre",
        "expenditure": 400_000,
        "status": WorkStatus.ONGOING,
        "sanctioned_date": date(2024, 1, 15),
        "last_progress_date": date(2024, 6, 1),
        "progress_percent": 40,
        "source": Provenance.SYNTHETIC,
        "lat": 25.30,
        "lon": 82.97,
        "financial_year": "2023-24",
    }
    values.update(overrides)
    return Work.model_validate(values)


def detected_pairs(works: list[Work]) -> set[frozenset[str]]:
    return {
        frozenset((flag.work_id, flag.related_work_id))
        for flag in DuplicateDetector().detect(works)
        if flag.related_work_id
    }


def test_bilingual_duplicate_is_detected() -> None:
    first = make_work(
        "W-HI-1",
        title="Construction of Community Hall at Shanti Nagar Ward 4",
        description="Community hall construction for Shanti Nagar Ward 4.",
    )
    second = make_work(
        "W-HI-2",
        title="वार्ड 4 शांति नगर में सामुदायिक भवन का निर्माण",
        description="शांति नगर वार्ड 4 सामुदायिक भवन का निर्माण.",
        sanction_amount=990_000,
        lat=25.3003,
        lon=82.9702,
    )

    assert frozenset((first.id, second.id)) in detected_pairs([first, second])


def test_transliterated_duplicate_is_detected() -> None:
    first = make_work(
        "W-TR-1",
        category=Category.WATER,
        title="Installation of Drinking Water Facility at Village Rampur",
        description="Drinking water facility construction for Rampur.",
    )
    second = make_work(
        "W-TR-2",
        category=Category.WATER,
        title="Gram Rampur mein Peyjal Suvidha ka Nirman",
        description="Rampur peyjal suvidha nirman.",
        sanction_amount=985_000,
        lat=25.3002,
        lon=82.9701,
    )

    assert frozenset((first.id, second.id)) in detected_pairs([first, second])


def test_explicit_spillover_continuation_is_exempt() -> None:
    parent = make_work(
        "W-PARENT",
        category=Category.ROAD,
        title="Construction of approach road at Lake Colony",
        description="Phase I approach road at Lake Colony.",
        sanction_amount=2_000_000,
        expenditure=1_980_000,
        status=WorkStatus.COMPLETED,
        progress_percent=100,
    )
    continuation = make_work(
        "W-CONT",
        category=Category.ROAD,
        title="Phase II continuation of approach road at Lake Colony",
        description="Balance work and additional scope for Lake Colony.",
        sanction_amount=2_650_000,
        is_continuation=True,
        parent_work_id=parent.id,
        lat=25.3001,
        lon=82.9701,
    )

    decision = evaluate_continuation_exemption(parent, continuation)
    assert decision.exempt
    assert decision.explicit_link
    assert DuplicateDetector().detect([parent, continuation]) == []


def test_median_mad_cost_outlier() -> None:
    amounts = [950_000, 980_000, 1_000_000, 1_020_000, 1_050_000, 4_500_000]
    works = [
        make_work(f"W-COST-{index}", sanction_amount=amount)
        for index, amount in enumerate(amounts)
    ]

    median, mad = median_and_mad(amounts)
    flags = CostOutlierDetector().detect(works)

    assert median == 1_010_000
    assert mad == 35_000
    assert [flag.work_id for flag in flags] == ["W-COST-5"]
    assert flags[0].evidence["method"] == "median/MAD"
    assert flags[0].evidence["work_unit_cost"] == 45_000
    assert flags[0].evidence["peer_median_unit_cost"] == 10_100
    assert flags[0].evidence["peer_mad_unit_cost"] == 350
    assert flags[0].evidence["quantity"] == 100
    assert flags[0].evidence["unit"] == "square_metre"


def test_total_sanction_does_not_flag_when_unit_cost_is_correct() -> None:
    works = [
        make_work("W-UNIT-1", sanction_amount=900_000, quantity=90),
        make_work("W-UNIT-2", sanction_amount=1_000_000, quantity=100),
        make_work("W-UNIT-3", sanction_amount=1_100_000, quantity=110),
        make_work("W-UNIT-LARGE", sanction_amount=10_000_000, quantity=1_000),
    ]

    assert {work.unit_cost for work in works} == {10_000}
    assert CostOutlierDetector().detect(works) == []


def test_unit_cost_benchmark_uses_state_fallback_for_sparse_districts() -> None:
    works = [
        make_work(
            "W-FALLBACK-TARGET",
            district="Sparse District",
            sanction_amount=4_000_000,
            quantity=100,
        ),
        make_work(
            "W-FALLBACK-LOCAL",
            district="Sparse District",
            sanction_amount=1_000_000,
            quantity=100,
        ),
        make_work(
            "W-FALLBACK-STATE-1",
            district="Peer District",
            sanction_amount=980_000,
            quantity=98,
        ),
        make_work(
            "W-FALLBACK-STATE-2",
            district="Peer District",
            sanction_amount=1_020_000,
            quantity=102,
        ),
    ]
    flags = CostOutlierDetector().detect(works)

    assert [flag.work_id for flag in flags] == ["W-FALLBACK-TARGET"]
    assert (
        flags[0].evidence["peer_scope"]
        == "category × state × financial year × unit fallback"
    )


def test_work_serializes_derived_unit_cost() -> None:
    work = make_work("W-DERIVED", sanction_amount=1_250_000, quantity=125)
    payload = work.model_dump(mode="json")

    assert work.unit_cost == 10_000
    assert payload["unit_cost"] == 10_000
    assert Work.model_validate(payload).unit_cost == 10_000


def test_stall_rules_begin_after_12_and_24_month_boundaries() -> None:
    stalled = make_work(
        "W-STALL",
        status=WorkStatus.SANCTIONED,
        sanctioned_date=date(2024, 1, 15),
        last_progress_date=None,
        progress_percent=0,
    )
    detector = StallDetector()

    assert detector.detect([stalled], as_of=date(2025, 1, 15)) == []
    twelve_month_flag = detector.detect([stalled], as_of=date(2025, 1, 16))[0]
    assert twelve_month_flag.points == 15
    assert twelve_month_flag.evidence["rule"] == "12-month stall review"

    boundary_flag = detector.detect([stalled], as_of=date(2026, 1, 15))[0]
    assert boundary_flag.points == 15
    twenty_four_month_flag = detector.detect(
        [stalled], as_of=date(2026, 1, 16)
    )[0]
    assert twenty_four_month_flag.points == 25
    assert twenty_four_month_flag.evidence["rule"] == "24-month lapse review"


def test_low_but_recent_progress_is_not_a_stall() -> None:
    work = make_work(
        "W-RECENT-LOW",
        sanctioned_date=date(2024, 1, 15),
        last_progress_date=date(2025, 2, 1),
        progress_percent=5,
    )

    assert StallDetector().detect([work], as_of=date(2025, 2, 15)) == []


def test_stale_progress_and_explicit_lapsed_status_remain_eligible() -> None:
    stale = make_work(
        "W-STALE-HIGH",
        sanctioned_date=date(2023, 4, 1),
        last_progress_date=date(2024, 1, 1),
        progress_percent=80,
    )
    explicitly_lapsed = make_work(
        "W-EXPLICIT-LAPSED",
        status=WorkStatus.LAPSED,
        sanctioned_date=date(2024, 1, 1),
        last_progress_date=date(2025, 1, 31),
        progress_percent=100,
    )
    flags = StallDetector().detect(
        [stale, explicitly_lapsed],
        as_of=date(2025, 2, 15),
    )

    assert {flag.work_id for flag in flags} == {
        "W-STALE-HIGH",
        "W-EXPLICIT-LAPSED",
    }
    lapsed_flag = next(
        flag for flag in flags if flag.work_id == explicitly_lapsed.id
    )
    assert lapsed_flag.evidence["explicit_lapsed_status"] is True
    assert lapsed_flag.evidence["stale_update"] is False


def test_photo_helpers_and_metadata_detector() -> None:
    sharp = Image.new("L", (64, 64), color=255)
    draw = ImageDraw.Draw(sharp)
    for coordinate in range(0, 64, 8):
        draw.rectangle((coordinate, 0, coordinate + 3, 63), fill=0)
        draw.rectangle((0, coordinate, 63, coordinate + 3), fill=0)
    blurred = sharp.filter(ImageFilter.GaussianBlur(radius=4))

    sharp_hash = perceptual_hash(sharp)
    assert sharp_hash == perceptual_hash(sharp.copy())
    assert hamming_distance(sharp_hash, sharp_hash) == 0
    assert variance_of_laplacian(sharp) > variance_of_laplacian(blurred)

    photo = PhotoMetadata(
        photo_id="PHOTO-A",
        perceptual_hash=sharp_hash,
        blur_score=20,
        width=320,
        height=240,
    )
    first = make_work("W-PHOTO-1", photo=photo)
    second = make_work(
        "W-PHOTO-2",
        photo=photo.model_copy(update={"photo_id": "PHOTO-B"}),
    )
    flags = PhotoMetadataDetector().detect([first, second])
    assert any(flag.related_work_id == second.id for flag in flags)
    assert any(flag.evidence["signal_type"] == "photo_quality" for flag in flags)


def make_flag(
    flag_id: str,
    detector: DetectorName,
    points: int,
    *,
    work_id: str = "W-SCORE",
    related_work_id: str | None = None,
) -> Flag:
    return Flag(
        id=flag_id,
        work_id=work_id,
        detector=detector,
        severity=Severity.HIGH,
        points=points,
        summary=f"{detector.value} review signal",
        related_work_id=related_work_id,
        review_status=ReviewStatus.PENDING,
    )


def test_pair_flags_contribute_to_both_endpoint_scores() -> None:
    first = make_work("W-PAIR-A")
    second = make_work("W-PAIR-B")
    flags = [
        make_flag(
            "F-PAIR-DUP",
            DetectorName.DUPLICATE,
            35,
            work_id=first.id,
            related_work_id=second.id,
        ),
        make_flag(
            "F-PAIR-PHOTO",
            DetectorName.PHOTO,
            20,
            work_id=first.id,
            related_work_id=second.id,
        ),
    ]

    _, scores = score_works([first, second], flags)
    assert scores[first.id].total_score == 55
    assert scores[second.id].total_score == 55
    assert [component.detector for component in scores[first.id].components] == [
        DetectorName.DUPLICATE,
        DetectorName.PHOTO,
    ]
    assert scores[first.id].components == scores[second.id].components


def test_role_scope_includes_one_canonical_pair_flag_from_related_endpoint() -> None:
    first = make_work(
        "W-SCOPE-A",
        title="Construction of Community Hall at Shanti Nagar Ward 4",
        description="Community hall construction for Shanti Nagar Ward 4.",
        mp_name="Other MP",
    )
    second = make_work(
        "W-SCOPE-B",
        title="वार्ड 4 शांति नगर में सामुदायिक भवन का निर्माण",
        description="शांति नगर वार्ड 4 सामुदायिक भवन का निर्माण.",
        mp_name="Scoped MP",
        lat=25.3002,
        lon=82.9701,
    )
    service = AnalysisService(
        [first, second],
        as_of=date(2024, 6, 1),
    )
    summary = service.dashboard_summary(role=Role.MP, mp="Scoped MP")

    assert summary["totals"]["works"] == 1
    assert summary["totals"]["flags"] == 1
    assert len(summary["audit_queue"]) == 1
    assert summary["audit_queue"][0]["work"]["id"] == second.id
    assert summary["audit_queue"][0]["flag"]["work_id"] == first.id


def test_scorecard_is_decomposable_and_tiers_are_exact() -> None:
    assert risk_tier(0) == RiskTier.GREEN
    assert risk_tier(39) == RiskTier.GREEN
    assert risk_tier(40) == RiskTier.AMBER
    assert risk_tier(69) == RiskTier.AMBER
    assert risk_tier(70) == RiskTier.RED
    assert risk_tier(100) == RiskTier.RED

    score = score_flags(
        "W-SCORE",
        [
            make_flag("F-DUP", DetectorName.DUPLICATE, 35),
            make_flag("F-COST", DetectorName.COST_OUTLIER, 30),
            make_flag("F-STALL", DetectorName.STALL, 25),
            make_flag("F-PHOTO", DetectorName.PHOTO, 20),
        ],
    )
    assert score.total_score == 100
    assert score.tier == RiskTier.RED
    assert [component.points for component in score.components] == [35, 30, 25, 10]
    assert sum(component.points for component in score.components) == score.total_score
    assert "duplicate 35" in score.explanation
