from __future__ import annotations

import hashlib
import math
import statistics
from itertools import combinations
from pathlib import Path
from typing import Iterable

from PIL import Image

from backend.models import DetectorName, Flag, Severity, Work


ImageInput = str | Path | Image.Image

DEFAULT_MAXIMUM_HASH_DISTANCE = 4
DEFAULT_BLUR_THRESHOLD = 80.0
DEFAULT_MINIMUM_DIMENSION = 480


def _grayscale_copy(image: ImageInput) -> Image.Image:
    if isinstance(image, Image.Image):
        return image.convert("L")
    with Image.open(image) as loaded:
        return loaded.convert("L").copy()


def perceptual_hash(
    image: ImageInput,
    *,
    hash_size: int = 8,
    high_frequency_factor: int = 4,
) -> str:
    """Compute a compact DCT perceptual hash without a numerical runtime."""
    if hash_size < 2 or high_frequency_factor < 1:
        raise ValueError("hash_size must be >=2 and high_frequency_factor must be >=1")
    size = hash_size * high_frequency_factor
    grayscale = _grayscale_copy(image).resize((size, size), Image.Resampling.LANCZOS)
    flattened_reader = getattr(grayscale, "get_flattened_data", None)
    pixels = list(
        flattened_reader() if flattened_reader is not None else grayscale.getdata()
    )

    cosine = [
        [
            math.cos((2 * coordinate + 1) * frequency * math.pi / (2 * size))
            for coordinate in range(size)
        ]
        for frequency in range(hash_size)
    ]
    coefficients: list[float] = []
    for vertical_frequency in range(hash_size):
        for horizontal_frequency in range(hash_size):
            coefficient = 0.0
            for y in range(size):
                row_offset = y * size
                vertical_weight = cosine[vertical_frequency][y]
                for x in range(size):
                    coefficient += (
                        pixels[row_offset + x]
                        * cosine[horizontal_frequency][x]
                        * vertical_weight
                    )
            coefficients.append(coefficient)

    median = statistics.median(coefficients[1:])
    value = 0
    for coefficient in coefficients:
        value = (value << 1) | int(coefficient >= median)
    hex_width = (hash_size * hash_size + 3) // 4
    return f"{value:0{hex_width}x}"


def variance_of_laplacian(image: ImageInput) -> float:
    """Return a focus score: lower values indicate a blurrier image."""
    grayscale = _grayscale_copy(image)
    width, height = grayscale.size
    if width < 3 or height < 3:
        return 0.0
    pixels = grayscale.load()
    responses: list[float] = []
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            centre = float(pixels[x, y])
            response = (
                4 * centre
                - float(pixels[x - 1, y])
                - float(pixels[x + 1, y])
                - float(pixels[x, y - 1])
                - float(pixels[x, y + 1])
            )
            responses.append(response)
    return statistics.pvariance(responses) if responses else 0.0


def hamming_distance(first_hash: str, second_hash: str) -> int:
    width = max(len(first_hash), len(second_hash))
    try:
        first_value = int(first_hash.zfill(width), 16)
        second_value = int(second_hash.zfill(width), 16)
    except ValueError as exc:
        raise ValueError("Perceptual hashes must be hexadecimal") from exc
    return (first_value ^ second_value).bit_count()


class PhotoMetadataDetector:
    def __init__(
        self,
        *,
        maximum_hash_distance: int = DEFAULT_MAXIMUM_HASH_DISTANCE,
        blur_threshold: float = DEFAULT_BLUR_THRESHOLD,
        minimum_dimension: int = DEFAULT_MINIMUM_DIMENSION,
    ) -> None:
        self.maximum_hash_distance = maximum_hash_distance
        self.blur_threshold = blur_threshold
        self.minimum_dimension = minimum_dimension

    def detect(self, works: Iterable[Work]) -> list[Flag]:
        records = [work for work in works if work.photo is not None]
        flags: list[Flag] = []

        for first, second in combinations(sorted(records, key=lambda item: item.id), 2):
            first_hash = first.photo.perceptual_hash if first.photo else None
            second_hash = second.photo.perceptual_hash if second.photo else None
            if not first_hash or not second_hash:
                continue
            distance = hamming_distance(first_hash, second_hash)
            if distance > self.maximum_hash_distance:
                continue

            identity = "|".join(sorted((first.id, second.id)))
            flag_id = (
                "FLG-PHOTO-REUSE-"
                + hashlib.sha1(identity.encode()).hexdigest()[:12].upper()
            )
            flags.append(
                Flag(
                    id=flag_id,
                    work_id=first.id,
                    detector=DetectorName.PHOTO,
                    severity=Severity.HIGH,
                    points=20,
                    summary=(
                        "Completion-photo metadata is perceptually similar across "
                        "different works; review the source images."
                    ),
                    related_work_id=second.id,
                    evidence={
                        "signal_type": "photo_reuse",
                        "hash_distance": distance,
                        "maximum_hash_distance": self.maximum_hash_distance,
                        "threshold_test": (
                            f"{distance} <= {self.maximum_hash_distance}"
                        ),
                        "metrics_source": (
                            "computed local PNG assets"
                            if first.photo.asset_url and second.photo.asset_url
                            else "metadata-only fallback"
                        ),
                        "primary_url": first.photo.asset_url,
                        "related_url": second.photo.asset_url,
                        "primary_photo": first.photo.model_dump(mode="json"),
                        "related_photo": second.photo.model_dump(mode="json"),
                    },
                )
            )

        for work in records:
            assert work.photo is not None
            reasons: list[str] = []
            if (
                work.photo.blur_score is not None
                and work.photo.blur_score < self.blur_threshold
            ):
                reasons.append("low focus score")
            if work.photo.placeholder:
                reasons.append("placeholder metadata")
            if (
                work.photo.width is not None
                and work.photo.height is not None
                and min(work.photo.width, work.photo.height) < self.minimum_dimension
            ):
                reasons.append("low resolution")
            if not reasons:
                continue

            flag_id = (
                "FLG-PHOTO-QUALITY-"
                + hashlib.sha1(work.id.encode()).hexdigest()[:12].upper()
            )
            flags.append(
                Flag(
                    id=flag_id,
                    work_id=work.id,
                    detector=DetectorName.PHOTO,
                    severity=Severity.MEDIUM,
                    points=10,
                    summary=(
                        "Completion-photo quality needs review: " + ", ".join(reasons) + "."
                    ),
                    evidence={
                        "signal_type": "photo_quality",
                        "reasons": reasons,
                        "blur_score": work.photo.blur_score,
                        "blur_threshold": self.blur_threshold,
                        "minimum_dimension": self.minimum_dimension,
                        "threshold_test": {
                            "blur": (
                                f"{work.photo.blur_score} < {self.blur_threshold}"
                                if work.photo.blur_score is not None
                                else "not available"
                            ),
                            "minimum_dimension": (
                                f"{min(work.photo.width, work.photo.height)} "
                                f"< {self.minimum_dimension}"
                                if work.photo.width is not None
                                and work.photo.height is not None
                                else "not available"
                            ),
                        },
                        "metrics_source": (
                            "computed local PNG asset"
                            if work.photo.asset_url
                            else "metadata-only fallback"
                        ),
                        "primary_url": work.photo.asset_url,
                        "photo": work.photo.model_dump(mode="json"),
                    },
                )
            )
        return sorted(flags, key=lambda flag: flag.id)


blur_score = variance_of_laplacian
