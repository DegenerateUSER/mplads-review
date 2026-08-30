from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from backend.models import DetectorName, Flag, RiskScore, RiskTier, ScoreComponent, Work


DETECTOR_CAPS: dict[DetectorName, int] = {
    DetectorName.DUPLICATE: 35,
    DetectorName.COST_OUTLIER: 30,
    DetectorName.STALL: 25,
    DetectorName.PHOTO: 20,
}


def risk_tier(score: int | float) -> RiskTier:
    if score >= 70:
        return RiskTier.RED
    if score >= 40:
        return RiskTier.AMBER
    return RiskTier.GREEN


def associated_work_ids(flag: Flag) -> set[str]:
    work_ids = {flag.work_id}
    if flag.related_work_id is not None:
        work_ids.add(flag.related_work_id)
    return work_ids


def score_flags(work_id: str, flags: Iterable[Flag]) -> RiskScore:
    grouped: dict[DetectorName, list[Flag]] = defaultdict(list)
    for flag in flags:
        if work_id in associated_work_ids(flag):
            grouped[flag.detector].append(flag)

    components: list[ScoreComponent] = []
    remaining_points = 100
    for detector in DETECTOR_CAPS:
        detector_flags = grouped.get(detector, [])
        if not detector_flags:
            continue
        maximum = DETECTOR_CAPS[detector]
        detector_award = min(maximum, sum(flag.points for flag in detector_flags))
        awarded = min(detector_award, remaining_points)
        explanations = "; ".join(flag.summary for flag in detector_flags)
        if awarded < detector_award:
            explanations += (
                f"; the global 100-point cap limits this component "
                f"from {detector_award} to {awarded} points"
            )
        components.append(
            ScoreComponent(
                detector=detector,
                points=awarded,
                maximum_points=maximum,
                flag_ids=[flag.id for flag in detector_flags],
                explanation=explanations,
            )
        )
        remaining_points -= awarded

    total = sum(component.points for component in components)
    tier = risk_tier(total)
    if components:
        decomposition = " + ".join(
            f"{component.detector.value} {component.points}"
            for component in components
        )
        explanation = f"{decomposition} = {total}/100 ({tier.value})"
    else:
        explanation = "No active anomaly signals = 0/100 (green)"
    return RiskScore(
        work_id=work_id,
        total_score=total,
        tier=tier,
        components=components,
        explanation=explanation,
    )


def score_works(
    works: Iterable[Work],
    flags: Iterable[Flag],
) -> tuple[list[Work], dict[str, RiskScore]]:
    records = [work.model_copy(deep=True) for work in works]
    all_flags = list(flags)
    scores: dict[str, RiskScore] = {}
    for work in records:
        score = score_flags(work.id, all_flags)
        work.risk_score = score.total_score
        work.risk_tier = score.tier
        scores[work.id] = score
    return records, scores
