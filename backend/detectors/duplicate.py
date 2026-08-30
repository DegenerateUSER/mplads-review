from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from dataclasses import dataclass
from itertools import combinations
from typing import Iterable

from rapidfuzz import fuzz

from backend.models import DetectorName, Flag, Severity, Work


DEFAULT_DUPLICATE_METHOD = "multilingual domain glossary + RapidFuzz"


_PHRASE_MAP = {
    "सामुदायिक भवन": " community hall ",
    "पेयजल सुविधा": " drinking water facility ",
    "शांति नगर": " shanti nagar ",
    "प्राथमिक विद्यालय": " primary school ",
    "स्वास्थ्य केंद्र": " health centre ",
    "नाली निर्माण": " drain construction ",
    "सड़क निर्माण": " road construction ",
    "का निर्माण": " construction ",
    "के निर्माण": " construction ",
    "ग्राम": " village ",
    "वार्ड": " ward ",
    "में": " at ",
    "रामपुर": " rampur ",
    "सुंदरपुर": " sundarpur ",
}

_TOKEN_MAP = {
    "samudaik": "community",
    "samudayik": "community",
    "community": "community",
    "bhavan": "hall",
    "bhawan": "hall",
    "hall": "hall",
    "nirman": "construction",
    "nirmaan": "construction",
    "construction": "construction",
    "constructing": "construction",
    "installation": "construction",
    "installing": "construction",
    "peyjal": "drinking",
    "peya-jal": "drinking",
    "drinking": "drinking",
    "jal": "water",
    "water": "water",
    "suvidha": "facility",
    "facility": "facility",
    "gram": "village",
    "gaon": "village",
    "village": "village",
    "sadak": "road",
    "road": "road",
    "vidyalaya": "school",
    "school": "school",
    "aspatal": "hospital",
    "hospital": "hospital",
    "kendra": "centre",
    "center": "centre",
    "centre": "centre",
    "shauchalaya": "toilet",
    "toilet": "toilet",
}

_STOP_WORDS = {
    "a",
    "an",
    "and",
    "at",
    "for",
    "in",
    "ka",
    "ke",
    "ki",
    "mein",
    "of",
    "the",
}

_CONTINUATION_TERMS = {
    "continuation",
    "continued",
    "spillover",
    "phase ii",
    "phase 2",
    "second phase",
    "balance work",
    "additional scope",
}


def canonicalize(text: str) -> str:
    """Canonicalize common English, Hindi, and transliterated MPLADS terms."""
    normalized = unicodedata.normalize("NFKC", text).lower()
    for original, replacement in _PHRASE_MAP.items():
        normalized = normalized.replace(original, replacement)
    normalized = re.sub(r"[^\w\s-]", " ", normalized, flags=re.UNICODE)
    normalized = normalized.replace("-", " ")

    tokens: list[str] = []
    for token in normalized.split():
        mapped = _TOKEN_MAP.get(token, token)
        if mapped not in _STOP_WORDS:
            tokens.append(mapped)
    return " ".join(tokens)


def financial_year_start(financial_year: str) -> int:
    match = re.search(r"(20\d{2})", financial_year)
    if not match:
        raise ValueError(f"Unsupported financial year: {financial_year}")
    return int(match.group(1))


def haversine_km(first: Work, second: Work) -> float:
    radius_km = 6371.0088
    lat1, lon1 = math.radians(first.lat), math.radians(first.lon)
    lat2, lon2 = math.radians(second.lat), math.radians(second.lon)
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


@dataclass(frozen=True)
class ContinuationDecision:
    exempt: bool
    reason: str
    explicit_link: bool
    phase_marker: bool
    status_progression: bool
    amount_delta_percent: float

    def as_dict(self) -> dict[str, object]:
        return {
            "exempt": self.exempt,
            "reason": self.reason,
            "explicit_link": self.explicit_link,
            "phase_marker": self.phase_marker,
            "status_progression": self.status_progression,
            "amount_delta_percent": round(self.amount_delta_percent, 2),
        }


def evaluate_continuation_exemption(
    first: Work,
    second: Work,
) -> ContinuationDecision:
    explicit_link = (
        first.parent_work_id == second.id
        or second.parent_work_id == first.id
        or (
            first.parent_work_id is not None
            and first.parent_work_id == second.parent_work_id
        )
    )
    combined_text = f"{first.title} {first.description} {second.title} {second.description}".lower()
    phase_marker = any(term in combined_text for term in _CONTINUATION_TERMS)
    status_progression = {
        first.status.value,
        second.status.value,
    } & {"Completed"} and {
        first.status.value,
        second.status.value,
    } & {"Sanctioned", "Ongoing"}
    status_progression_bool = bool(status_progression)
    denominator = max(min(first.sanction_amount, second.sanction_amount), 1)
    amount_delta = abs(first.sanction_amount - second.sanction_amount) / denominator

    if explicit_link:
        return ContinuationDecision(
            exempt=True,
            reason=(
                "Explicit parent/continuation linkage identifies separate sanctioned scope; "
                "the pair is retained in provenance but excluded from duplicate review."
            ),
            explicit_link=True,
            phase_marker=phase_marker,
            status_progression=status_progression_bool,
            amount_delta_percent=amount_delta * 100,
        )
    if phase_marker and status_progression_bool and amount_delta >= 0.10:
        return ContinuationDecision(
            exempt=True,
            reason=(
                "Phase/spillover wording, completed-to-ongoing status progression, and a "
                "material amount delta indicate a legitimate continuation."
            ),
            explicit_link=False,
            phase_marker=True,
            status_progression=True,
            amount_delta_percent=amount_delta * 100,
        )
    return ContinuationDecision(
        exempt=False,
        reason=(
            "No qualifying continuation linkage or combined phase, status, and amount-delta "
            "evidence was found."
        ),
        explicit_link=explicit_link,
        phase_marker=phase_marker,
        status_progression=status_progression_bool,
        amount_delta_percent=amount_delta * 100,
    )


class LazySentenceEmbedder:
    """Optional embedding scorer; the dependency and model load are always lazy."""

    def __init__(
        self,
        model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    ) -> None:
        self.model_name = model_name
        self._model = None

    def similarity(self, first: str, second: str) -> float:
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise RuntimeError(
                    "Install the optional 'embeddings' extra to enable sentence embeddings."
                ) from exc
            self._model = SentenceTransformer(self.model_name)

        vectors = self._model.encode([first, second], normalize_embeddings=True)
        first_vector = vectors[0].tolist()
        second_vector = vectors[1].tolist()
        similarity = sum(a * b for a, b in zip(first_vector, second_vector, strict=True))
        return max(0.0, min(1.0, float(similarity)))


@dataclass(frozen=True)
class DuplicateSignals:
    text_similarity: float
    amount_similarity: float
    geo_similarity: float
    geo_distance_km: float
    combined_score: float
    embedding_similarity: float | None


class DuplicateDetector:
    """Domain-glossary/RapidFuzz baseline with explicitly optional embeddings."""

    def __init__(
        self,
        threshold: float = 0.80,
        minimum_text_similarity: float = 0.72,
        use_embeddings: bool = False,
        embedder: LazySentenceEmbedder | None = None,
    ) -> None:
        self.threshold = threshold
        self.minimum_text_similarity = minimum_text_similarity
        self.use_embeddings = use_embeddings
        self.embedder = embedder or LazySentenceEmbedder()

    def compare(self, first: Work, second: Work) -> DuplicateSignals:
        first_text = canonicalize(f"{first.title} {first.description}")
        second_text = canonicalize(f"{second.title} {second.description}")
        lexical_similarity = fuzz.token_set_ratio(first_text, second_text) / 100
        embedding_similarity: float | None = None
        text_similarity = lexical_similarity
        if self.use_embeddings:
            embedding_similarity = self.embedder.similarity(
                f"{first.title}. {first.description}",
                f"{second.title}. {second.description}",
            )
            text_similarity = 0.65 * lexical_similarity + 0.35 * embedding_similarity

        amount_similarity = 1 - (
            abs(first.sanction_amount - second.sanction_amount)
            / max(first.sanction_amount, second.sanction_amount, 1)
        )
        distance = haversine_km(first, second)
        geo_similarity = max(0.0, 1 - distance / 5)
        combined = 0.65 * text_similarity + 0.20 * amount_similarity + 0.15 * geo_similarity
        return DuplicateSignals(
            text_similarity=text_similarity,
            amount_similarity=amount_similarity,
            geo_similarity=geo_similarity,
            geo_distance_km=distance,
            combined_score=combined,
            embedding_similarity=embedding_similarity,
        )

    def detect(self, works: Iterable[Work]) -> list[Flag]:
        blocks: dict[tuple[str, str], list[Work]] = {}
        for work in works:
            key = (work.district.casefold(), work.category.value)
            blocks.setdefault(key, []).append(work)

        flags: list[Flag] = []
        for block in blocks.values():
            ordered = sorted(block, key=lambda work: work.id)
            for first, second in combinations(ordered, 2):
                if abs(
                    financial_year_start(first.financial_year)
                    - financial_year_start(second.financial_year)
                ) > 1:
                    continue

                exemption = evaluate_continuation_exemption(first, second)
                if exemption.exempt:
                    continue

                signals = self.compare(first, second)
                if (
                    signals.text_similarity < self.minimum_text_similarity
                    or signals.combined_score < self.threshold
                ):
                    continue

                if signals.combined_score >= 0.92:
                    severity, points = Severity.HIGH, 35
                elif signals.combined_score >= 0.86:
                    severity, points = Severity.MEDIUM, 30
                else:
                    severity, points = Severity.LOW, 25

                identity = "|".join(sorted((first.id, second.id)))
                flag_id = f"FLG-DUP-{hashlib.sha1(identity.encode()).hexdigest()[:12].upper()}"
                flags.append(
                    Flag(
                        id=flag_id,
                        work_id=first.id,
                        detector=DetectorName.DUPLICATE,
                        severity=severity,
                        points=points,
                        summary=(
                            f"Possible duplicate work for review: "
                            f"{signals.text_similarity:.0%} canonical text match, "
                            f"{signals.geo_distance_km:.2f} km apart."
                        ),
                        related_work_id=second.id,
                        evidence={
                            "text_similarity": round(signals.text_similarity, 4),
                            "amount_similarity": round(signals.amount_similarity, 4),
                            "sanction_amount_delta": round(
                                abs(first.sanction_amount - second.sanction_amount),
                                2,
                            ),
                            "geo_similarity": round(signals.geo_similarity, 4),
                            "geo_distance_km": round(signals.geo_distance_km, 3),
                            "combined_score": round(signals.combined_score, 4),
                            "matching_method": DEFAULT_DUPLICATE_METHOD,
                            "capabilities": {
                                "baseline": "domain glossary + RapidFuzz token-set similarity",
                                "embeddings_enabled": self.use_embeddings,
                                "embeddings": (
                                    "optional and lazy-loaded only when explicitly enabled"
                                ),
                                "general_embedding_search": False,
                            },
                            "embedding_similarity": (
                                round(signals.embedding_similarity, 4)
                                if signals.embedding_similarity is not None
                                else None
                            ),
                            "blocking": {
                                "district": first.district,
                                "category": first.category.value,
                                "financial_year_window": "±1",
                            },
                            "continuation_assessment": exemption.as_dict(),
                        },
                    )
                )
        return sorted(flags, key=lambda flag: flag.id)
