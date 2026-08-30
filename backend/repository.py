from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Protocol

from backend.models import ReviewRecord, Work


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
