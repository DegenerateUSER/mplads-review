from __future__ import annotations

import hashlib
import random
from datetime import date, timedelta
from typing import Any

from backend.models import (
    Category,
    PhotoMetadata,
    Provenance,
    Work,
    WorkStatus,
)


DEMO_SEED = 26102
DEMO_AS_OF_DATE = date(2026, 8, 30)

DISTRICTS = [
    {
        "state": "Maharashtra",
        "district": "Pune",
        "constituency": "Pune Demo",
        "mp_name": "Demo MP Asha Deshmukh",
        "lat": 18.5204,
        "lon": 73.8567,
        "localities": ["Kothrud", "Hadapsar", "Dhanori", "Undri"],
    },
    {
        "state": "Maharashtra",
        "district": "Nashik",
        "constituency": "Nashik Demo",
        "mp_name": "Demo MP Rohit Patil",
        "lat": 19.9975,
        "lon": 73.7898,
        "localities": ["Satpur", "Makhmalabad", "Deolali", "Panchavati"],
    },
    {
        "state": "Uttar Pradesh",
        "district": "Varanasi",
        "constituency": "Varanasi Demo",
        "mp_name": "Demo MP Kavita Mishra",
        "lat": 25.3176,
        "lon": 82.9739,
        "localities": ["Sarnath", "Ramnagar", "Lohata", "Chiraigaon"],
    },
    {
        "state": "Uttar Pradesh",
        "district": "Lucknow",
        "constituency": "Lucknow Demo",
        "mp_name": "Demo MP Imran Siddiqui",
        "lat": 26.8467,
        "lon": 80.9462,
        "localities": ["Aliganj", "Chinhat", "Kakori", "Mohanlalganj"],
    },
    {
        "state": "Tamil Nadu",
        "district": "Madurai",
        "constituency": "Madurai Demo",
        "mp_name": "Demo MP Meena Selvam",
        "lat": 9.9252,
        "lon": 78.1198,
        "localities": ["Avaniyapuram", "Othakadai", "Thiruparankundram", "Kochadai"],
    },
    {
        "state": "Tamil Nadu",
        "district": "Coimbatore",
        "constituency": "Coimbatore Demo",
        "mp_name": "Demo MP Arul Kumar",
        "lat": 11.0168,
        "lon": 76.9558,
        "localities": ["Sulur", "Perur", "Saravanampatti", "Thondamuthur"],
    },
    {
        "state": "Assam",
        "district": "Kamrup Metropolitan",
        "constituency": "Guwahati Demo",
        "mp_name": "Demo MP Rina Das",
        "lat": 26.1445,
        "lon": 91.7362,
        "localities": ["Dispur", "Jalukbari", "Beltola", "Sonapur"],
    },
    {
        "state": "Assam",
        "district": "Dibrugarh",
        "constituency": "Dibrugarh Demo",
        "mp_name": "Demo MP Nayan Bora",
        "lat": 27.4728,
        "lon": 94.9120,
        "localities": ["Chabua", "Lahowal", "Moran", "Tingkhong"],
    },
]

CATEGORY_SPECS = {
    Category.ROAD: ("metre", 500.0, 4_800.0),
    Category.BUILDING: ("square_metre", 250.0, 14_000.0),
    Category.WATER: ("household_connection", 120.0, 15_000.0),
    Category.SANITATION: ("metre", 250.0, 5_000.0),
    Category.EDUCATION: ("classroom", 4.0, 700_000.0),
    Category.HEALTH: ("treatment_bed", 8.0, 400_000.0),
    Category.ELECTRIFICATION: ("street_light", 40.0, 40_000.0),
    Category.OTHER: ("asset", 7.0, 150_000.0),
}

CATEGORY_COSTS = {
    category: base_quantity * base_unit_cost
    for category, (_, base_quantity, base_unit_cost) in CATEGORY_SPECS.items()
}

DISCRETE_UNITS = {
    "asset",
    "classroom",
    "household_connection",
    "street_light",
    "treatment_bed",
}

TITLE_TEMPLATES = {
    Category.ROAD: "Improvement of link road near {locality}",
    Category.BUILDING: "Construction of public service building at {locality}",
    Category.WATER: "Drinking water facility for {locality}",
    Category.SANITATION: "Covered drain and sanitation work at {locality}",
    Category.EDUCATION: "Classroom improvement at {locality} school",
    Category.HEALTH: "Primary health facility upgrade at {locality}",
    Category.ELECTRIFICATION: "Solar street lighting at {locality}",
    Category.OTHER: "Public utility improvement at {locality}",
}

PURPOSES = [
    "market access corridor",
    "school approach and pedestrian safety",
    "community service cluster",
    "monsoon resilience package",
]

COORDINATE_OFFSETS = [
    (-0.055, -0.045),
    (-0.035, 0.050),
    (0.040, -0.052),
    (0.058, 0.044),
]


def _normal_photo_hash(work_id: str) -> str:
    return hashlib.sha256(f"synthetic-photo:{work_id}".encode()).hexdigest()[:16]


def _financial_year_date(
    rng: random.Random,
    start_year: int,
    variant: int,
) -> date:
    start = date(start_year, 4, 1)
    return start + timedelta(days=25 + variant * 57 + rng.randint(0, 18))


def _financial_year(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def _base_quantity(category: Category, variant: int) -> float:
    unit, base_quantity, _ = CATEGORY_SPECS[category]
    quantity = base_quantity * (0.78, 0.92, 1.08, 1.24)[variant]
    if unit in DISCRETE_UNITS:
        return float(max(1, round(quantity)))
    return float(round(quantity))


def generate_demo_dataset(
    *,
    seed: int = DEMO_SEED,
    as_of: date = DEMO_AS_OF_DATE,
) -> tuple[list[Work], dict[str, Any]]:
    rng = random.Random(seed)
    works: list[Work] = []
    serial = 0

    duplicate_pairs: list[dict[str, str]] = []
    cost_outlier_ids: list[str] = []
    stalled_ids: list[str] = []
    photo_reuse_pairs: list[list[str]] = []
    low_quality_photo_ids: list[str] = []
    continuation_exemptions: list[list[str]] = []

    def next_id() -> str:
        nonlocal serial
        serial += 1
        return f"WRK-{serial:05d}"

    def agency(district: str) -> str:
        return f"{district} District Authority (synthetic)"

    # Four robust peers per category, district, and financial year.
    for district_index, location in enumerate(DISTRICTS):
        for start_year in (2023, 2024, 2025):
            financial_year = _financial_year(start_year)
            for category_index, (
                category,
                (unit, _, base_unit_cost),
            ) in enumerate(
                CATEGORY_SPECS.items()
            ):
                for variant in range(4):
                    work_id = next_id()
                    sanctioned = _financial_year_date(rng, start_year, variant)
                    locality = location["localities"][variant]
                    quantity = _base_quantity(category, variant)
                    unit_cost_factor = (0.94, 0.98, 1.02, 1.06)[variant]
                    year_factor = 1 + 0.045 * (start_year - 2023)
                    amount = round(
                        base_unit_cost
                        * quantity
                        * unit_cost_factor
                        * year_factor
                        * (0.99 + rng.random() * 0.02)
                        / 1_000
                    ) * 1_000

                    if start_year == 2023 and variant < 3:
                        status = WorkStatus.COMPLETED
                        progress = 100.0
                    elif start_year == 2024 and variant < 2:
                        status = WorkStatus.COMPLETED
                        progress = 100.0
                    else:
                        status = WorkStatus.ONGOING
                        progress = float(42 + variant * 13 + rng.randint(0, 8))

                    if status == WorkStatus.COMPLETED:
                        last_progress = min(
                            sanctioned + timedelta(days=310 + rng.randint(0, 140)),
                            as_of - timedelta(days=40 + rng.randint(0, 100)),
                        )
                        expenditure = amount * (0.92 + rng.random() * 0.07)
                        photo = PhotoMetadata(
                            photo_id=f"SYN-PHOTO-{work_id}",
                            perceptual_hash=_normal_photo_hash(work_id),
                            blur_score=115 + rng.random() * 95,
                            width=1280,
                            height=960,
                            captured_date=last_progress,
                        )
                    else:
                        last_progress = as_of - timedelta(days=30 + rng.randint(0, 160))
                        expenditure = amount * (progress / 100) * (
                            0.72 + rng.random() * 0.15
                        )
                        photo = None

                    if start_year == 2023:
                        title = TITLE_TEMPLATES[category].format(locality=locality)
                        description = (
                            f"New asset for the {PURPOSES[variant]} at {locality}; "
                            f"synthetic recommendation tranche "
                            f"{district_index + 1}-{variant + 1}."
                        )
                    elif start_year == 2024:
                        title = (
                            f"Scheduled renewal of {category.value.lower()} asset "
                            f"serving {locality}"
                        )
                        description = (
                            f"Condition-led repair covering {PURPOSES[(variant + 1) % 4]}; "
                            f"synthetic maintenance cycle "
                            f"{district_index + 1}-{variant + 1}."
                        )
                    else:
                        title = (
                            f"Capacity extension for {locality} "
                            f"{category.value.lower()} facility"
                        )
                        description = (
                            f"Service augmentation for {PURPOSES[(variant + 2) % 4]}; "
                            f"synthetic expansion tranche "
                            f"{district_index + 1}-{variant + 1}."
                        )

                    offset_lat, offset_lon = COORDINATE_OFFSETS[variant]
                    constituency = (
                        location["constituency"]
                        if variant < 2
                        else f"{location['district']} Rural Demo"
                    )
                    mp_name = (
                        location["mp_name"]
                        if variant < 2
                        else f"Demo MP {location['district']} Rural"
                    )
                    works.append(
                        Work(
                            id=work_id,
                            title=title + f" — package {category_index + 1}{variant + 1}",
                            description=description,
                            state=location["state"],
                            district=location["district"],
                            constituency=constituency,
                            mp_name=mp_name,
                            category=category,
                            sanction_amount=amount,
                            quantity=quantity,
                            unit=unit,
                            expenditure=round(expenditure, 2),
                            status=status,
                            sanctioned_date=sanctioned,
                            last_progress_date=last_progress,
                            progress_percent=progress,
                            source=Provenance.SYNTHETIC,
                            lat=location["lat"] + offset_lat,
                            lon=location["lon"] + offset_lon,
                            financial_year=financial_year,
                            implementing_agency=agency(location["district"]),
                            photo=photo,
                        )
                    )

    for district_index, location in enumerate(DISTRICTS):
        # High-confidence Hindi/English pair. It deliberately combines detector
        # signals to create a decomposable red-tier evidence example.
        shared_hash = hashlib.sha256(
            f"reused-community-photo:{district_index}".encode()
        ).hexdigest()[:16]
        english_id = next_id()
        hindi_id = next_id()
        high_amount = CATEGORY_COSTS[Category.BUILDING] * (4.15 + 0.03 * district_index)
        common_fields = {
            "state": location["state"],
            "district": location["district"],
            "constituency": location["constituency"],
            "mp_name": location["mp_name"],
            "category": Category.BUILDING,
            "quantity": CATEGORY_SPECS[Category.BUILDING][1],
            "unit": CATEGORY_SPECS[Category.BUILDING][0],
            "status": WorkStatus.ONGOING,
            "source": Provenance.SYNTHETIC,
            "financial_year": "2023-24",
            "implementing_agency": agency(location["district"]),
        }
        works.append(
            Work(
                id=english_id,
                title="Construction of Community Hall at Shanti Nagar Ward 4",
                description=(
                    "Community hall construction for Shanti Nagar Ward 4 residents "
                    f"in {location['district']}."
                ),
                sanction_amount=round(high_amount / 1_000) * 1_000,
                expenditure=round(high_amount * 0.08, 2),
                sanctioned_date=date(2023, 6, 15),
                last_progress_date=date(2023, 11, 20),
                progress_percent=12,
                lat=location["lat"] + 0.006,
                lon=location["lon"] + 0.005,
                photo=PhotoMetadata(
                    photo_id=f"SYN-PHOTO-{english_id}",
                    perceptual_hash=shared_hash,
                    blur_score=150,
                    width=1280,
                    height=960,
                    captured_date=date(2023, 11, 20),
                ),
                **common_fields,
            )
        )
        works.append(
            Work(
                id=hindi_id,
                title="वार्ड 4 शांति नगर में सामुदायिक भवन का निर्माण",
                description=(
                    f"शांति नगर वार्ड 4 सामुदायिक भवन का निर्माण, {location['district']}."
                ),
                sanction_amount=round(high_amount * 0.985 / 1_000) * 1_000,
                expenditure=round(high_amount * 0.07, 2),
                sanctioned_date=date(2023, 7, 2),
                last_progress_date=date(2023, 12, 4),
                progress_percent=10,
                lat=location["lat"] + 0.0064,
                lon=location["lon"] + 0.0053,
                photo=PhotoMetadata(
                    photo_id=f"SYN-PHOTO-{hindi_id}",
                    perceptual_hash=shared_hash,
                    blur_score=150,
                    width=1280,
                    height=960,
                    captured_date=date(2023, 12, 4),
                ),
                **common_fields,
            )
        )
        duplicate_pairs.append(
            {"first": english_id, "second": hindi_id, "kind": "Hindi/English"}
        )
        cost_outlier_ids.extend([english_id, hindi_id])
        stalled_ids.extend([english_id, hindi_id])
        photo_reuse_pairs.append([english_id, hindi_id])

        # Transliterated Hindi/English pair exercises the same local-first
        # canonicalization without requiring an embedding model.
        english_water_id = next_id()
        transliterated_water_id = next_id()
        water_amount = CATEGORY_COSTS[Category.WATER] * (
            1.02 + district_index * 0.002
        )
        water_common = {
            "state": location["state"],
            "district": location["district"],
            "constituency": location["constituency"],
            "mp_name": location["mp_name"],
            "category": Category.WATER,
            "quantity": CATEGORY_SPECS[Category.WATER][1],
            "unit": CATEGORY_SPECS[Category.WATER][0],
            "status": WorkStatus.ONGOING,
            "source": Provenance.SYNTHETIC,
            "financial_year": "2025-26",
            "implementing_agency": agency(location["district"]),
            "sanctioned_date": date(2025, 8, 12),
            "last_progress_date": date(2026, 7, 10),
            "progress_percent": 68,
        }
        works.append(
            Work(
                id=english_water_id,
                title="Installation of Drinking Water Facility at Village Rampur",
                description=(
                    f"Drinking water facility construction for Rampur in "
                    f"{location['district']}."
                ),
                sanction_amount=round(water_amount / 1_000) * 1_000,
                expenditure=round(water_amount * 0.52, 2),
                lat=location["lat"] - 0.008,
                lon=location["lon"] + 0.009,
                **water_common,
            )
        )
        works.append(
            Work(
                id=transliterated_water_id,
                title="Gram Rampur mein Peyjal Suvidha ka Nirman",
                description=(
                    f"Rampur peyjal suvidha nirman, {location['district']}."
                ),
                sanction_amount=round(water_amount * 0.99 / 1_000) * 1_000,
                expenditure=round(water_amount * 0.49, 2),
                lat=location["lat"] - 0.0084,
                lon=location["lon"] + 0.0092,
                **water_common,
            )
        )
        duplicate_pairs.append(
            {
                "first": english_water_id,
                "second": transliterated_water_id,
                "kind": "transliterated Hindi/English",
            }
        )

        # Additional low-progress record broadens the district review queue.
        stalled_id = next_id()
        works.append(
            Work(
                id=stalled_id,
                title=f"Sanitation block at {location['localities'][0]}",
                description=(
                    "Synthetic stalled-work example with no recent progress entry."
                ),
                state=location["state"],
                district=location["district"],
                constituency=location["constituency"],
                mp_name=location["mp_name"],
                category=Category.SANITATION,
                sanction_amount=1_340_000 + district_index * 9_000,
                quantity=260,
                unit=CATEGORY_SPECS[Category.SANITATION][0],
                expenditure=81_000,
                status=WorkStatus.SANCTIONED,
                sanctioned_date=date(2024, 5, 10),
                last_progress_date=None,
                progress_percent=0,
                source=Provenance.SYNTHETIC,
                lat=location["lat"] + 0.021,
                lon=location["lon"] - 0.018,
                financial_year="2024-25",
                implementing_agency=agency(location["district"]),
                photo=PhotoMetadata(
                    photo_id=f"SYN-PHOTO-{stalled_id}",
                    perceptual_hash=_normal_photo_hash(stalled_id),
                    blur_score=22,
                    width=360,
                    height=240,
                    captured_date=date(2024, 6, 2),
                    placeholder=True,
                ),
            )
        )
        stalled_ids.append(stalled_id)
        low_quality_photo_ids.append(stalled_id)

        # Explicitly linked phases look similar but are a documented exemption.
        parent_id = next_id()
        continuation_id = next_id()
        works.append(
            Work(
                id=parent_id,
                title="Construction of approach road at Lake Colony",
                description="Phase I approach road serving Lake Colony market.",
                state=location["state"],
                district=location["district"],
                constituency=location["constituency"],
                mp_name=location["mp_name"],
                category=Category.ROAD,
                sanction_amount=2_380_000,
                quantity=500,
                unit=CATEGORY_SPECS[Category.ROAD][0],
                expenditure=2_310_000,
                status=WorkStatus.COMPLETED,
                sanctioned_date=date(2024, 4, 18),
                last_progress_date=date(2025, 3, 20),
                progress_percent=100,
                source=Provenance.SYNTHETIC,
                lat=location["lat"] - 0.026,
                lon=location["lon"] - 0.024,
                financial_year="2024-25",
                implementing_agency=agency(location["district"]),
                photo=PhotoMetadata(
                    photo_id=f"SYN-PHOTO-{parent_id}",
                    perceptual_hash=_normal_photo_hash(parent_id),
                    blur_score=162,
                    width=1280,
                    height=960,
                    captured_date=date(2025, 3, 20),
                ),
            )
        )
        works.append(
            Work(
                id=continuation_id,
                title="Phase II continuation of approach road at Lake Colony",
                description=(
                    "Explicit continuation for the balance stretch and additional scope."
                ),
                state=location["state"],
                district=location["district"],
                constituency=location["constituency"],
                mp_name=location["mp_name"],
                category=Category.ROAD,
                sanction_amount=3_180_000,
                quantity=650,
                unit=CATEGORY_SPECS[Category.ROAD][0],
                expenditure=1_420_000,
                status=WorkStatus.ONGOING,
                sanctioned_date=date(2025, 5, 12),
                last_progress_date=date(2026, 7, 25),
                progress_percent=58,
                source=Provenance.SYNTHETIC,
                lat=location["lat"] - 0.0256,
                lon=location["lon"] - 0.0242,
                financial_year="2025-26",
                implementing_agency=agency(location["district"]),
                is_continuation=True,
                parent_work_id=parent_id,
            )
        )
        continuation_exemptions.append([parent_id, continuation_id])

    ground_truth: dict[str, Any] = {
        "dataset": "SIH 2026 deterministic MPLADS review demo",
        "source": "synthetic",
        "seed": seed,
        "as_of_date": as_of.isoformat(),
        "portal_coverage_note": (
            "Synthetic work dates begin in FY 2023-24, matching the stated "
            "work-level portal coverage boundary."
        ),
        "record_count": len(works),
        "states": sorted({work.state for work in works}),
        "districts": sorted({work.district for work in works}),
        "mp_names": sorted({work.mp_name for work in works}),
        "categories": [category.value for category in Category],
        "duplicate_pairs": duplicate_pairs,
        "cost_outlier_work_ids": sorted(cost_outlier_ids),
        "stalled_work_ids": sorted(stalled_ids),
        "photo_reuse_pairs": photo_reuse_pairs,
        "low_quality_photo_work_ids": sorted(low_quality_photo_ids),
        # Compatibility key retained for consumers of the original demo manifest.
        "blurred_photo_work_ids": sorted(low_quality_photo_ids),
        "photo_fixture_work_ids": sorted(
            {
                work_id
                for pair in photo_reuse_pairs
                for work_id in pair
            }
            | set(low_quality_photo_ids)
        ),
        "continuation_exempt_pairs": continuation_exemptions,
        "duplicate_detection": {
            "default_method": "multilingual domain glossary + RapidFuzz",
            "general_embeddings_default": False,
            "embeddings": "optional and lazy-loaded when explicitly enabled",
        },
        "interpretation": (
            "Ground truth identifies injected anomaly examples for detector testing. "
            "Flags remain review recommendations, not adjudications."
        ),
    }
    return works, ground_truth
