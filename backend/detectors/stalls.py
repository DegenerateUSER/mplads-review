from __future__ import annotations

import calendar
import hashlib
from datetime import date
from typing import Iterable

from backend.models import DetectorName, Flag, Severity, Work, WorkStatus


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def completed_months(start: date, end: date) -> int:
    months = (end.year - start.year) * 12 + end.month - start.month
    if end.day < start.day:
        months -= 1
    return max(0, months)


class StallDetector:
    def __init__(
        self,
        review_months: int = 12,
        lapse_months: int = 24,
        stale_update_days: int = 365,
    ) -> None:
        self.review_months = review_months
        self.lapse_months = lapse_months
        self.stale_update_days = stale_update_days

    def detect(
        self,
        works: Iterable[Work],
        *,
        as_of: date | None = None,
    ) -> list[Flag]:
        reference_date = as_of or date.today()
        flags: list[Flag] = []
        for work in works:
            if work.status == WorkStatus.COMPLETED:
                continue
            if (
                work.progress_percent >= 100
                and work.status != WorkStatus.LAPSED
            ):
                continue

            review_boundary = add_months(work.sanctioned_date, self.review_months)
            if reference_date <= review_boundary:
                continue

            update_date = work.last_progress_date or work.sanctioned_date
            update_age_days = max(0, (reference_date - update_date).days)
            low_progress = work.progress_percent <= 25
            missing_progress_update = work.last_progress_date is None
            stale_update = (
                work.last_progress_date is not None
                and update_age_days > self.stale_update_days
            )
            explicit_lapsed_status = work.status == WorkStatus.LAPSED
            if not (
                missing_progress_update
                or stale_update
                or explicit_lapsed_status
            ):
                continue

            lapse_boundary = add_months(work.sanctioned_date, self.lapse_months)
            elapsed_months = completed_months(work.sanctioned_date, reference_date)
            if reference_date > lapse_boundary:
                severity, points, rule = Severity.HIGH, 25, "24-month lapse review"
            else:
                severity, points, rule = Severity.MEDIUM, 15, "12-month stall review"

            flag_id = (
                "FLG-STALL-"
                + hashlib.sha1(work.id.encode()).hexdigest()[:12].upper()
            )
            flags.append(
                Flag(
                    id=flag_id,
                    work_id=work.id,
                    detector=DetectorName.STALL,
                    severity=severity,
                    points=points,
                    summary=(
                        f"{rule}: {elapsed_months} completed months since sanction, "
                        f"{work.progress_percent:.0f}% progress."
                    ),
                    evidence={
                        "rule": rule,
                        "as_of_date": reference_date.isoformat(),
                        "sanctioned_date": work.sanctioned_date.isoformat(),
                        "review_boundary": review_boundary.isoformat(),
                        "lapse_boundary": lapse_boundary.isoformat(),
                        "elapsed_months": elapsed_months,
                        "progress_percent": work.progress_percent,
                        "last_progress_date": (
                            work.last_progress_date.isoformat()
                            if work.last_progress_date
                            else None
                        ),
                        "update_age_days": update_age_days,
                        "low_progress": low_progress,
                        "low_but_recent_progress": (
                            low_progress
                            and not missing_progress_update
                            and not stale_update
                        ),
                        "missing_progress_update": missing_progress_update,
                        "stale_update": stale_update,
                        "explicit_lapsed_status": explicit_lapsed_status,
                        "boundary_policy": "A rule begins the day after its month boundary.",
                    },
                )
            )
        return sorted(flags, key=lambda flag: flag.id)
