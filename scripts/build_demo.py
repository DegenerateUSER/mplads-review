from __future__ import annotations

import sys
import random
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.analysis import AnalysisService
from backend.detectors.photos import (
    DEFAULT_BLUR_THRESHOLD,
    DEFAULT_MAXIMUM_HASH_DISTANCE,
    hamming_distance,
    perceptual_hash,
    variance_of_laplacian,
)
from backend.models import DetectorName, Provenance
from backend.repository import atomic_write_json
from data.generator import DEMO_AS_OF_DATE, generate_demo_dataset


def _reused_photo_fixture(pair_index: int, nonce: int = 0) -> Image.Image:
    """Create a sharp, unmistakably synthetic image reused by one work pair."""
    width, height = 640, 480
    image = Image.new("RGB", (width, height), (244, 241, 232))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width, 58), fill=(104, 20, 92))
    draw.text(
        (18, 18),
        f"SYNTHETIC DEMO PHOTO - REUSED PAIR {pair_index + 1:02d}",
        fill=(255, 255, 255),
    )

    rng = random.Random(74_000 + pair_index * 997 + nonce)
    tile_width, tile_height = 72, 54
    for row in range(6):
        for column in range(8):
            luminance = rng.choice((25, 62, 112, 178, 222))
            colour = (
                luminance,
                max(0, min(255, luminance + rng.randint(-28, 28))),
                max(0, min(255, luminance + rng.randint(-28, 28))),
            )
            left = 24 + column * tile_width
            top = 78 + row * tile_height
            draw.rectangle(
                (left, top, left + tile_width - 8, top + tile_height - 8),
                fill=colour,
                outline=(15, 15, 15),
                width=2,
            )

    draw.rectangle((64, 384, 576, 442), fill=(244, 241, 232), outline=(20, 20, 20), width=3)
    draw.text(
        (82, 402),
        "GENERATED FIXTURE - NOT A REAL SITE PHOTOGRAPH",
        fill=(30, 30, 30),
    )
    return image


def _low_quality_photo_fixture(record_index: int, nonce: int = 0) -> Image.Image:
    """Create a deliberately blurred, low-resolution synthetic fixture."""
    width, height = 320, 240
    image = Image.new("RGB", (width, height), (224, 216, 198))
    draw = ImageDraw.Draw(image)
    rng = random.Random(91_000 + record_index * 613 + nonce)
    for _ in range(12):
        left = rng.randint(-40, width - 40)
        top = rng.randint(-35, height - 35)
        diameter = rng.randint(55, 130)
        colour = tuple(rng.randint(45, 215) for _ in range(3))
        draw.ellipse(
            (left, top, left + diameter, top + diameter),
            fill=colour,
        )
    draw.text((24, 92), "SYNTHETIC LOW QUALITY DEMO", fill=(35, 35, 35))
    draw.text((56, 116), "NOT FIELD EVIDENCE", fill=(35, 35, 35))
    return image.filter(ImageFilter.GaussianBlur(radius=7))


def _unique_fixture(
    factory,
    index: int,
    used_hashes: list[str],
    *,
    low_quality: bool,
) -> Image.Image:
    for nonce in range(100):
        image = factory(index, nonce)
        image_hash = perceptual_hash(image)
        if any(
            hamming_distance(image_hash, existing) <= DEFAULT_MAXIMUM_HASH_DISTANCE
            for existing in used_hashes
        ):
            continue
        blur_score = variance_of_laplacian(image)
        if low_quality and blur_score >= DEFAULT_BLUR_THRESHOLD:
            continue
        if not low_quality and blur_score < DEFAULT_BLUR_THRESHOLD:
            continue
        used_hashes.append(image_hash)
        return image
    raise RuntimeError("Could not generate a distinct deterministic photo fixture")


def _apply_computed_photo_metadata(work, fixture_path: Path) -> None:
    if work.photo is None:
        raise ValueError(f"Fixture work {work.id} has no PhotoMetadata")
    with Image.open(fixture_path) as loaded:
        width, height = loaded.size
    work.photo = work.photo.model_copy(
        update={
            "perceptual_hash": perceptual_hash(fixture_path),
            "blur_score": round(variance_of_laplacian(fixture_path), 3),
            "width": width,
            "height": height,
            "asset_url": f"/api/demo-photos/{fixture_path.name}",
            "source_note": (
                "Clearly synthetic PNG fixture; pHash and Laplacian focus "
                "were computed from this local asset."
            ),
        }
    )


def generate_photo_fixtures(
    output_directory: Path,
    works,
    ground_truth: dict[str, object],
) -> list[Path]:
    photos_directory = output_directory / "photos"
    photos_directory.mkdir(parents=True, exist_ok=True)
    for stale_fixture in photos_directory.glob("*.png"):
        stale_fixture.unlink()

    work_by_id = {work.id: work for work in works}
    generated: list[Path] = []
    used_hashes: list[str] = []
    reuse_pairs = ground_truth["photo_reuse_pairs"]
    low_quality_ids = ground_truth["low_quality_photo_work_ids"]

    for pair_index, pair in enumerate(reuse_pairs):
        fixture = _unique_fixture(
            _reused_photo_fixture,
            pair_index,
            used_hashes,
            low_quality=False,
        )
        for work_id in pair:
            path = photos_directory / f"{work_id}.png"
            fixture.save(path, format="PNG")
            _apply_computed_photo_metadata(work_by_id[work_id], path)
            generated.append(path)

    for record_index, work_id in enumerate(low_quality_ids):
        fixture = _unique_fixture(
            _low_quality_photo_fixture,
            record_index,
            used_hashes,
            low_quality=True,
        )
        path = photos_directory / f"{work_id}.png"
        fixture.save(path, format="PNG")
        _apply_computed_photo_metadata(work_by_id[work_id], path)
        generated.append(path)

    expected_ids = set(ground_truth["photo_fixture_work_ids"])
    generated_ids = {path.stem for path in generated}
    if generated_ids != expected_ids or len(generated) < 24:
        raise RuntimeError("Demo photo fixture set is incomplete")
    return sorted(generated)


def build_demo(output_directory: Path | None = None) -> tuple[Path, Path]:
    output = output_directory or PROJECT_ROOT / "data" / "demo"
    output.mkdir(parents=True, exist_ok=True)
    works, ground_truth = generate_demo_dataset(as_of=DEMO_AS_OF_DATE)
    if any(work.source != Provenance.SYNTHETIC for work in works):
        raise ValueError("The demo generator must label every generated record synthetic")

    photo_paths = generate_photo_fixtures(output, works, ground_truth)
    service = AnalysisService(works, as_of=DEMO_AS_OF_DATE)
    enriched_works = sorted(service.works.values(), key=lambda work: work.id)
    flags = list(service.flags.values())
    detector_counts = Counter(flag.detector.value for flag in flags)
    tier_counts = Counter(work.risk_tier.value for work in enriched_works)

    detected_duplicate_pairs = {
        frozenset((flag.work_id, flag.related_work_id))
        for flag in flags
        if flag.detector == DetectorName.DUPLICATE and flag.related_work_id
    }
    injected_duplicate_pairs = {
        frozenset((pair["first"], pair["second"]))
        for pair in ground_truth["duplicate_pairs"]
    }
    missed_pairs = injected_duplicate_pairs - detected_duplicate_pairs
    if missed_pairs:
        raise RuntimeError(
            f"Demo detector missed {len(missed_pairs)} injected duplicate pair(s)"
        )

    exempt_pairs = {
        frozenset(pair) for pair in ground_truth["continuation_exempt_pairs"]
    }
    incorrectly_flagged_exemptions = exempt_pairs & detected_duplicate_pairs
    if incorrectly_flagged_exemptions:
        raise RuntimeError("A continuation/spillover example was flagged as a duplicate")

    detected_cost_ids = {
        flag.work_id
        for flag in flags
        if flag.detector == DetectorName.COST_OUTLIER
    }
    missed_cost_ids = set(ground_truth["cost_outlier_work_ids"]) - detected_cost_ids
    if missed_cost_ids:
        raise RuntimeError(
            f"Demo detector missed {len(missed_cost_ids)} unit-cost outlier(s)"
        )

    detected_photo_pairs = {
        frozenset((flag.work_id, flag.related_work_id))
        for flag in flags
        if (
            flag.detector == DetectorName.PHOTO
            and flag.related_work_id
            and flag.evidence.get("signal_type") == "photo_reuse"
        )
    }
    injected_photo_pairs = {
        frozenset(pair) for pair in ground_truth["photo_reuse_pairs"]
    }
    missed_photo_pairs = injected_photo_pairs - detected_photo_pairs
    if missed_photo_pairs:
        raise RuntimeError(
            f"Demo detector missed {len(missed_photo_pairs)} photo reuse pair(s)"
        )

    ground_truth["build_summary"] = {
        "flag_count": len(flags),
        "detector_counts": dict(sorted(detector_counts.items())),
        "risk_tier_counts": dict(sorted(tier_counts.items())),
        "injected_duplicate_pairs_detected": len(injected_duplicate_pairs),
        "injected_unit_cost_outliers_detected": len(
            set(ground_truth["cost_outlier_work_ids"])
        ),
        "injected_photo_reuse_pairs_detected": len(injected_photo_pairs),
        "photo_fixture_count": len(photo_paths),
        "continuation_exemptions_respected": len(exempt_pairs),
    }

    works_path = output / "works.json"
    ground_truth_path = output / "ground_truth.json"
    atomic_write_json(
        works_path,
        [work.model_dump(mode="json") for work in enriched_works],
    )
    atomic_write_json(ground_truth_path, ground_truth)
    return works_path, ground_truth_path


if __name__ == "__main__":
    built_works, built_ground_truth = build_demo()
    print(f"Wrote {built_works}")
    print(f"Wrote {built_ground_truth}")
    print(f"Wrote {len(list((built_works.parent / 'photos').glob('*.png')))} PNG fixtures")
