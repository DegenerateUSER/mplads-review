from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from typing import Iterable

from backend.detectors import (
    CostOutlierDetector,
    DuplicateDetector,
    PhotoMetadataDetector,
    StallDetector,
)
from backend.detectors.duplicate import DEFAULT_DUPLICATE_METHOD, canonicalize
from backend.detectors.photos import (
    DEFAULT_BLUR_THRESHOLD,
    DEFAULT_MAXIMUM_HASH_DISTANCE,
    DEFAULT_MINIMUM_DIMENSION,
    hamming_distance,
)
from backend.models import (
    DetectorName,
    EvidencePayload,
    EvidenceSignal,
    Flag,
    Provenance,
    ReviewRecord,
    ReviewRequest,
    RiskScore,
    RiskTier,
    Role,
    TextMatch,
    Work,
)
from backend.repository import InMemoryReviewRepository, ReviewRepository
from backend.scoring import associated_work_ids, score_works


class AnalysisService:
    def __init__(
        self,
        works: Iterable[Work],
        *,
        as_of: date | None = None,
        review_repository: ReviewRepository | None = None,
        duplicate_detector: DuplicateDetector | None = None,
    ) -> None:
        self.as_of = as_of or date.today()
        self.review_repository = review_repository or InMemoryReviewRepository()
        source_records = [work.model_copy(deep=True) for work in works]

        detectors = (
            duplicate_detector or DuplicateDetector(),
            CostOutlierDetector(),
            StallDetector(),
            PhotoMetadataDetector(),
        )
        flags: list[Flag] = []
        for detector in detectors:
            if isinstance(detector, StallDetector):
                flags.extend(detector.detect(source_records, as_of=self.as_of))
            else:
                flags.extend(detector.detect(source_records))

        reviews = self.review_repository.load_reviews()
        reviewed_flags: list[Flag] = []
        for flag in flags:
            review = reviews.get(flag.id)
            if review:
                flag = flag.model_copy(
                    update={
                        "review_status": review.review_status,
                        "review": review.model_dump(mode="json"),
                    }
                )
            reviewed_flags.append(flag)

        enriched_works, scores = score_works(source_records, reviewed_flags)
        self.works = {work.id: work for work in enriched_works}
        self.flags = {flag.id: flag for flag in reviewed_flags}
        self.scores: dict[str, RiskScore] = scores

    def get_work(self, work_id: str) -> Work | None:
        return self.works.get(work_id)

    def get_flag(self, flag_id: str) -> Flag | None:
        return self.flags.get(flag_id)

    def get_score(self, work_id: str) -> RiskScore | None:
        return self.scores.get(work_id)

    def list_works(
        self,
        *,
        state: str | None = None,
        district: str | None = None,
        mp: str | None = None,
        category: str | None = None,
        status: str | None = None,
        risk_tier: str | None = None,
    ) -> list[Work]:
        records = list(self.works.values())
        if state:
            records = [item for item in records if item.state.casefold() == state.casefold()]
        if district:
            records = [
                item for item in records if item.district.casefold() == district.casefold()
            ]
        if mp:
            records = [item for item in records if item.mp_name.casefold() == mp.casefold()]
        if category:
            records = [
                item for item in records if item.category.value.casefold() == category.casefold()
            ]
        if status:
            records = [
                item for item in records if item.status.value.casefold() == status.casefold()
            ]
        if risk_tier:
            records = [
                item
                for item in records
                if item.risk_tier.value.casefold() == risk_tier.casefold()
            ]
        return sorted(records, key=lambda item: (-item.risk_score, item.id))

    def list_flags(
        self,
        *,
        detector: str | None = None,
        severity: str | None = None,
        review_status: str | None = None,
        work_ids: set[str] | None = None,
    ) -> list[Flag]:
        records = list(self.flags.values())
        if detector:
            records = [
                item
                for item in records
                if item.detector.value.casefold() == detector.casefold()
            ]
        if severity:
            records = [
                item
                for item in records
                if item.severity.value.casefold() == severity.casefold()
            ]
        if review_status:
            records = [
                item
                for item in records
                if item.review_status.value.casefold() == review_status.casefold()
            ]
        if work_ids is not None:
            records = [
                item
                for item in records
                if associated_work_ids(item) & work_ids
            ]
        return sorted(
            records,
            key=lambda item: (-item.points, item.detector.value, item.id),
        )

    def evidence_for_flag(self, flag_id: str) -> EvidencePayload | None:
        flag = self.flags.get(flag_id)
        if not flag:
            return None
        primary = self.works[flag.work_id]
        related = (
            self.works.get(flag.related_work_id)
            if flag.related_work_id is not None
            else None
        )

        text_matches: list[TextMatch] = []
        if related is not None and flag.detector == DetectorName.DUPLICATE:
            for field in ("title", "description"):
                primary_text = getattr(primary, field)
                related_text = getattr(related, field)
                primary_terms = set(canonicalize(primary_text).split())
                related_terms = set(canonicalize(related_text).split())
                signal_similarity = float(flag.evidence.get("text_similarity", 0))
                text_matches.append(
                    TextMatch(
                        field=field,
                        primary_text=primary_text,
                        related_text=related_text,
                        common_terms=sorted(primary_terms & related_terms),
                        similarity=signal_similarity,
                    )
                )

        signals: list[EvidenceSignal] = []
        if flag.detector == DetectorName.DUPLICATE:
            signals = [
                EvidenceSignal(
                    label="Canonical text similarity",
                    value=f"{float(flag.evidence.get('text_similarity', 0)):.0%}",
                    points=flag.points,
                    explanation=(
                        f"The default {DEFAULT_DUPLICATE_METHOD} baseline compares "
                        "domain-canonical English, Hindi, and transliterated terms; "
                        "it is not general embedding search."
                    ),
                ),
                EvidenceSignal(
                    label="Sanction amount proximity",
                    value=f"{float(flag.evidence.get('amount_similarity', 0)):.0%}",
                    explanation="Close sanctioned amounts strengthen the review signal.",
                ),
                EvidenceSignal(
                    label="Geographic distance",
                    value=f"{float(flag.evidence.get('geo_distance_km', 0)):.2f} km",
                    explanation="Nearby coordinates strengthen the pair match.",
                ),
                EvidenceSignal(
                    label="Continuation exemption",
                    value=(
                        "Exempt"
                        if flag.evidence.get("continuation_assessment", {}).get(
                            "exempt", False
                        )
                        else "Not applicable"
                    ),
                    explanation=str(
                        flag.evidence.get("continuation_assessment", {}).get(
                            "reason",
                            "No continuation evidence supplied.",
                        )
                    ),
                ),
            ]
        elif flag.detector == DetectorName.COST_OUTLIER:
            unit = str(flag.evidence.get("unit", primary.unit))
            quantity = float(flag.evidence.get("quantity", primary.quantity))
            unit_cost_ratio = float(
                flag.evidence.get(
                    "unit_cost_ratio",
                    flag.evidence.get("cost_ratio", 0),
                )
            )
            peer_median_unit_cost = float(
                flag.evidence.get(
                    "peer_median_unit_cost",
                    flag.evidence.get("peer_median", 0),
                )
            )
            peer_mad_unit_cost = float(
                flag.evidence.get(
                    "peer_mad_unit_cost",
                    flag.evidence.get("peer_mad", 0),
                )
            )
            signals = [
                EvidenceSignal(
                    label="Unit-cost ratio",
                    value=f"{unit_cost_ratio:.1f}× median",
                    points=flag.points,
                    explanation=(
                        "Sanction amount divided by quantity is compared with peers "
                        "that use the same work unit."
                    ),
                ),
                EvidenceSignal(
                    label="Work unit cost",
                    value=(
                        f"₹{float(flag.evidence.get('work_unit_cost', primary.unit_cost)):,.2f} "
                        f"per {unit}"
                    ),
                    explanation="Derived deterministically as sanction amount ÷ quantity.",
                ),
                EvidenceSignal(
                    label="Peer median unit cost",
                    value=f"₹{peer_median_unit_cost:,.2f} per {unit}",
                    explanation=(
                        f"{flag.evidence.get('peer_count', 0)} peers; "
                        f"{flag.evidence.get('peer_scope', 'robust peer group')}."
                    ),
                ),
                EvidenceSignal(
                    label="Quantity and unit",
                    value=f"{quantity:g} {unit}",
                    explanation="Only records with the same category and unit are benchmarked.",
                ),
                EvidenceSignal(
                    label="Peer MAD",
                    value=f"₹{peer_mad_unit_cost:,.2f} per {unit}",
                    explanation="Median and MAD limit the influence of extreme estimates.",
                ),
            ]
        elif flag.detector == DetectorName.STALL:
            signals = [
                EvidenceSignal(
                    label="Temporal rule",
                    value=str(flag.evidence.get("rule", "stall review")),
                    points=flag.points,
                    explanation=str(flag.evidence.get("boundary_policy", "")),
                ),
                EvidenceSignal(
                    label="Elapsed time",
                    value=f"{flag.evidence.get('elapsed_months', 0)} months",
                    explanation="Completed calendar months since sanction.",
                ),
                EvidenceSignal(
                    label="Recorded progress",
                    value=f"{float(flag.evidence.get('progress_percent', 0)):.0f}%",
                    explanation=(
                        f"Last update age: {flag.evidence.get('update_age_days', 0)} days."
                    ),
                ),
            ]
        else:
            signals = [
                EvidenceSignal(
                    label="Photo review signal",
                    value=str(flag.evidence.get("signal_type", "photo quality")),
                    points=flag.points,
                    explanation=flag.summary,
                )
            ]

        photo_evidence: dict[str, object]
        primary_photo = primary.photo
        related_photo = related.photo if related is not None else None
        primary_reference = primary_photo.photo_id if primary_photo else None
        related_reference = (
            related_photo.photo_id if related_photo is not None else None
        )
        primary_url = primary_photo.asset_url if primary_photo else None
        related_url = related_photo.asset_url if related_photo else None
        maximum_hash_distance = int(
            flag.evidence.get(
                "maximum_hash_distance",
                DEFAULT_MAXIMUM_HASH_DISTANCE,
            )
        )
        hash_distance: int | None = None
        if (
            primary_photo
            and related_photo
            and primary_photo.perceptual_hash
            and related_photo.perceptual_hash
        ):
            hash_distance = hamming_distance(
                primary_photo.perceptual_hash,
                related_photo.perceptual_hash,
            )
        hash_match = (
            hash_distance is not None
            and hash_distance <= maximum_hash_distance
        )
        blur_threshold = float(
            flag.evidence.get("blur_threshold", DEFAULT_BLUR_THRESHOLD)
        )
        minimum_dimension = int(
            flag.evidence.get("minimum_dimension", DEFAULT_MINIMUM_DIMENSION)
        )
        metrics_source = (
            "computed local PNG assets"
            if primary_url or related_url
            else "metadata-only fallback"
        )
        threshold_details = {
            "hash_distance": hash_distance,
            "maximum_hash_distance": maximum_hash_distance,
            "hash_match": hash_match,
            "primary_blur_score": (
                primary_photo.blur_score if primary_photo else None
            ),
            "related_blur_score": (
                related_photo.blur_score if related_photo else None
            ),
            "blur_threshold": blur_threshold,
            "minimum_dimension": minimum_dimension,
            "metrics_source": metrics_source,
        }
        if flag.detector == DetectorName.PHOTO:
            photo_evidence = {
                "status": "flagged",
                "summary": flag.summary,
                "primary_reference": primary_reference,
                "related_reference": related_reference,
                "primary_url": primary_url,
                "related_url": related_url,
                "hash_distance": hash_distance,
                "maximum_hash_distance": maximum_hash_distance,
                "blur_threshold": blur_threshold,
                "threshold_details": threshold_details,
                "details": flag.evidence,
            }
        elif primary_photo is not None or related_photo is not None:
            photo_evidence = {
                "status": "flagged" if hash_match else "not_flagged",
                "summary": (
                    "The synthetic photos meet the perceptual-hash reuse threshold."
                    if hash_match
                    else "Photo metadata is available without a matching reuse signal."
                ),
                "primary_reference": primary_reference,
                "related_reference": related_reference,
                "primary_url": primary_url,
                "related_url": related_url,
                "hash_distance": hash_distance,
                "maximum_hash_distance": maximum_hash_distance,
                "blur_threshold": blur_threshold,
                "threshold_details": threshold_details,
            }
        else:
            photo_evidence = {
                "status": "not_available",
                "summary": "No photo metadata is available for this review.",
                "primary_reference": None,
                "related_reference": None,
                "primary_url": None,
                "related_url": None,
                "hash_distance": None,
                "maximum_hash_distance": maximum_hash_distance,
                "blur_threshold": blur_threshold,
                "threshold_details": threshold_details,
            }

        return EvidencePayload(
            flag=flag,
            primary_work=primary,
            related_work=related,
            risk=self.scores[primary.id],
            signals=signals,
            text_matches=text_matches,
            photo_evidence=photo_evidence,
        )

    def review_flag(self, flag_id: str, request: ReviewRequest) -> Flag | None:
        flag = self.flags.get(flag_id)
        if not flag:
            return None
        record = ReviewRecord(
            flag_id=flag_id,
            review_status=request.review_status,
            reviewer=request.reviewer,
            notes=request.notes,
            reviewed_at=datetime.now(timezone.utc),
        )
        self.review_repository.save_review(record)
        updated = flag.model_copy(
            update={
                "review_status": request.review_status,
                "review": record.model_dump(mode="json"),
            }
        )
        self.flags[flag_id] = updated
        return updated

    def dashboard_summary(
        self,
        *,
        role: Role,
        state: str | None = None,
        district: str | None = None,
        mp: str | None = None,
    ) -> dict[str, object]:
        works = self.list_works(state=state, district=district, mp=mp)
        work_ids = {work.id for work in works}
        flags = self.list_flags(work_ids=work_ids)
        flagged_work_ids = {
            associated_id
            for flag in flags
            for associated_id in associated_work_ids(flag)
            if associated_id in work_ids
        }

        tier_counts = Counter(work.risk_tier.value for work in works)
        detector_counts = Counter(flag.detector.value for flag in flags)
        provenance_counts = Counter(work.source.value for work in works)
        totals = {
            "works": len(works),
            "flags": len(flags),
            "flagged_works": len(flagged_work_ids),
            "flagged": len(flagged_work_ids),
            "high_risk": tier_counts[RiskTier.RED.value],
            "pending_review": sum(
                flag.review_status.value == "pending" for flag in flags
            ),
            "sanction_amount": round(sum(work.sanction_amount for work in works), 2),
            "expenditure": round(sum(work.expenditure for work in works), 2),
            "green": tier_counts[RiskTier.GREEN.value],
            "amber": tier_counts[RiskTier.AMBER.value],
            "red": tier_counts[RiskTier.RED.value],
        }

        district_works: dict[tuple[str, str], list[Work]] = defaultdict(list)
        for work in works:
            district_works[(work.state, work.district)].append(work)

        by_district: list[dict[str, object]] = []
        for (work_state, work_district), records in district_works.items():
            counts = Counter(work.risk_tier.value for work in records)
            district_record_ids = {work.id for work in records}
            relevant_flags = [
                flag
                for flag in flags
                if associated_work_ids(flag) & district_record_ids
            ]
            district_flagged_work_ids = {
                associated_id
                for flag in relevant_flags
                for associated_id in associated_work_ids(flag)
                if associated_id in district_record_ids
            }
            max_risk = max(work.risk_score for work in records)
            average_risk = round(
                sum(work.risk_score for work in records) / len(records),
                1,
            )
            by_district.append(
                {
                    "state": work_state,
                    "district": work_district,
                    "works": len(records),
                    "total_works": len(records),
                    "flags": len(relevant_flags),
                    "flagged_works": len(district_flagged_work_ids),
                    "pending_review": sum(
                        flag.review_status.value == "pending"
                        for flag in relevant_flags
                    ),
                    "green": counts[RiskTier.GREEN.value],
                    "amber": counts[RiskTier.AMBER.value],
                    "red": counts[RiskTier.RED.value],
                    "average_risk": average_risk,
                    "average_risk_score": average_risk,
                    "max_risk": max_risk,
                    "risk_tier": (
                        RiskTier.RED.value
                        if max_risk >= 70
                        else RiskTier.AMBER.value
                        if max_risk >= 40
                        else RiskTier.GREEN.value
                    ),
                    "sanction_amount": round(
                        sum(work.sanction_amount for work in records),
                        2,
                    ),
                }
            )
        by_district.sort(
            key=lambda item: (
                -int(item["red"]),
                -float(item["average_risk_score"]),
                str(item["district"]),
            )
        )

        audit_queue: list[dict[str, object]] = []
        for flag in flags:
            queued_work_id = (
                flag.work_id
                if flag.work_id in work_ids
                else flag.related_work_id
            )
            if queued_work_id is None:
                continue
            work = self.works[queued_work_id]
            audit_queue.append(
                {
                    "flag": flag.model_dump(mode="json"),
                    "work": work.model_dump(mode="json"),
                }
            )
        audit_queue.sort(
            key=lambda item: (
                -int(item["work"]["risk_score"]),
                -int(item["flag"]["points"]),
                str(item["flag"]["id"]),
            )
        )

        return {
            "role": role.value,
            "filters": {"state": state, "district": district, "mp": mp},
            "as_of_date": self.as_of.isoformat(),
            "totals": totals,
            "detector_counts": {
                detector.value: detector_counts[detector.value]
                for detector in DetectorName
            },
            "provenance_counts": {
                source.value: provenance_counts[source.value] for source in Provenance
            },
            "by_district": by_district,
            "audit_queue": audit_queue,
        }
