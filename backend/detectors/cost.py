from __future__ import annotations

import hashlib
import statistics
from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from backend.models import DetectorName, Flag, Severity, Work


def median_and_mad(values: Iterable[float]) -> tuple[float, float]:
    samples = [float(value) for value in values]
    if not samples:
        raise ValueError("At least one value is required")
    median = statistics.median(samples)
    mad = statistics.median(abs(value - median) for value in samples)
    return median, mad


@dataclass(frozen=True)
class PeerBenchmark:
    scope: str
    count: int
    median: float
    mad: float


class CostOutlierDetector:
    def __init__(
        self,
        robust_z_threshold: float = 3.5,
        minimum_cost_ratio: float = 1.8,
        minimum_group_size: int = 4,
    ) -> None:
        self.robust_z_threshold = robust_z_threshold
        self.minimum_cost_ratio = minimum_cost_ratio
        self.minimum_group_size = minimum_group_size

    def _benchmarks(self, works: list[Work]) -> dict[str, PeerBenchmark]:
        district_groups: dict[
            tuple[str, str, str, str, str],
            list[Work],
        ] = defaultdict(list)
        state_groups: dict[tuple[str, str, str, str], list[Work]] = defaultdict(list)
        for work in works:
            district_groups[
                (
                    work.state.casefold(),
                    work.district.casefold(),
                    work.category.value.casefold(),
                    work.financial_year,
                    work.unit.casefold(),
                )
            ].append(work)
            state_groups[
                (
                    work.state.casefold(),
                    work.category.value.casefold(),
                    work.financial_year,
                    work.unit.casefold(),
                )
            ].append(work)

        benchmarks: dict[str, PeerBenchmark] = {}
        for work in works:
            district_peers = district_groups[
                (
                    work.state.casefold(),
                    work.district.casefold(),
                    work.category.value.casefold(),
                    work.financial_year,
                    work.unit.casefold(),
                )
            ]
            if len(district_peers) >= self.minimum_group_size:
                peers = district_peers
                scope = "category × district × financial year × unit"
            else:
                peers = state_groups[
                    (
                        work.state.casefold(),
                        work.category.value.casefold(),
                        work.financial_year,
                        work.unit.casefold(),
                    )
                ]
                scope = "category × state × financial year × unit fallback"

            if len(peers) < self.minimum_group_size:
                continue
            median, mad = median_and_mad(peer.unit_cost for peer in peers)
            benchmarks[work.id] = PeerBenchmark(
                scope=scope,
                count=len(peers),
                median=median,
                mad=mad,
            )
        return benchmarks

    def detect(self, works: Iterable[Work]) -> list[Flag]:
        records = list(works)
        benchmarks = self._benchmarks(records)
        flags: list[Flag] = []
        for work in records:
            benchmark = benchmarks.get(work.id)
            if benchmark is None or benchmark.median <= 0:
                continue

            unit_cost_ratio = work.unit_cost / benchmark.median
            if benchmark.mad == 0:
                robust_z = float("inf") if work.unit_cost > benchmark.median else 0.0
            else:
                robust_z = (
                    0.6745
                    * (work.unit_cost - benchmark.median)
                    / benchmark.mad
                )

            if (
                robust_z < self.robust_z_threshold
                or unit_cost_ratio < self.minimum_cost_ratio
            ):
                continue

            if robust_z >= 8 or unit_cost_ratio >= 3:
                severity, points = Severity.HIGH, 30
            elif robust_z >= 5 or unit_cost_ratio >= 2.3:
                severity, points = Severity.MEDIUM, 25
            else:
                severity, points = Severity.LOW, 20

            flag_id = (
                "FLG-COST-"
                + hashlib.sha1(work.id.encode()).hexdigest()[:12].upper()
            )
            flags.append(
                Flag(
                    id=flag_id,
                    work_id=work.id,
                    detector=DetectorName.COST_OUTLIER,
                    severity=severity,
                    points=points,
                    summary=(
                        f"Unit cost is {unit_cost_ratio:.1f}× the robust peer median "
                        f"for {work.quantity:g} {work.unit}; review the estimate and scope."
                    ),
                    evidence={
                        "peer_scope": benchmark.scope,
                        "peer_count": benchmark.count,
                        "peer_median_unit_cost": round(benchmark.median, 2),
                        "peer_mad_unit_cost": round(benchmark.mad, 2),
                        "work_unit_cost": work.unit_cost,
                        "quantity": work.quantity,
                        "unit": work.unit,
                        "unit_cost_ratio": round(unit_cost_ratio, 3),
                        # Compatibility aliases retain the prior evidence contract,
                        # but now consistently refer to the benchmarked unit cost.
                        "peer_median": round(benchmark.median, 2),
                        "peer_mad": round(benchmark.mad, 2),
                        "work_amount": round(work.sanction_amount, 2),
                        "cost_ratio": round(unit_cost_ratio, 3),
                        "robust_z": (
                            round(robust_z, 3)
                            if robust_z != float("inf")
                            else "infinite"
                        ),
                        "method": "median/MAD",
                        "measure": "sanction_amount / quantity",
                    },
                )
            )
        return sorted(flags, key=lambda flag: flag.id)
