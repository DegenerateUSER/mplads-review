import { getDemoEvidence, getDemoSummary } from "./demo";
import type {
  ApiResult,
  AuditQueueItem,
  DashboardSummary,
  DistrictSummary,
  EvidenceResponse,
  Flag,
  PhotoEvidence,
  ReviewStatus,
  RiskComponent,
  RiskScore,
  RiskSignal,
  RiskTier,
  RoleMode,
  TextMatch,
  Work,
} from "./types";

const DEFAULT_API_URL = "http://localhost:8000/api";
const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 1_800;
const API_ORIGIN = (() => {
  try {
    return new URL(API_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
})();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function tierFromScore(score: number): RiskTier {
  if (score >= 70) return "red";
  if (score >= 40) return "amber";
  return "green";
}

function normaliseRiskTier(value: unknown, score = 0): RiskTier {
  if (value === "red" || value === "amber" || value === "green") return value;
  return tierFromScore(score);
}

function normaliseSeverity(value: unknown, score = 0): RiskTier {
  if (value === "red" || value === "amber" || value === "green") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "high") return "red";
    if (lower === "medium" || lower === "elevated") return "amber";
    if (lower === "low") return "green";
  }
  return tierFromScore(score);
}

function normaliseReviewStatus(value: unknown): ReviewStatus {
  if (
    value === "pending" ||
    value === "reviewed" ||
    value === "disputed" ||
    value === "dismissed" ||
    value === "needs_follow_up"
  ) {
    return value;
  }
  return "pending";
}

function normaliseDetector(value: unknown, evidence?: Record<string, unknown>) {
  const detector = asString(value, "unclassified").toLowerCase();
  const aliases: Record<string, string> = {
    duplicate: "duplicate_work",
    cost_outlier: "unit_cost_outlier",
    stall: "stalled_work",
  };
  if (detector === "photo") {
    const subtype = asString(evidence?.signal_type).toLowerCase();
    if (subtype === "photo_reuse" || subtype === "photo_quality") return subtype;
    return "photo";
  }
  return aliases[detector] ?? detector;
}

function aggregateDetector(value: unknown) {
  const detector = normaliseDetector(value);
  return detector === "photo_reuse" || detector === "photo_quality" ? "photo" : detector;
}

function resolveAssetUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const resolved = new URL(value, `${API_ORIGIN}/`);
    return resolved.protocol === "http:" || resolved.protocol === "https:"
      ? resolved.href
      : null;
  } catch {
    return null;
  }
}

function normaliseWork(value: unknown): Work | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  if (!id) return null;
  const riskScore = asNumber(value.risk_score);
  const quantity = asOptionalNumber(value.quantity);
  const unit = asString(value.unit).trim() || undefined;
  const unitCost = asOptionalNumber(value.unit_cost);
  const rawSource = asString(value.source, "synthetic");
  const source =
    rawSource === "real_scraped" || rawSource === "manually_compiled"
      ? rawSource
      : "synthetic";

  return {
    id,
    title: asString(value.title, "Untitled work"),
    description: asString(value.description),
    state: asString(value.state, "Unknown state"),
    district: asString(value.district, "Unknown district"),
    constituency: asString(value.constituency, "Unknown constituency"),
    mp_name: asString(value.mp_name, "Not supplied"),
    category: asString(value.category, "Other"),
    sanction_amount: asNumber(value.sanction_amount),
    expenditure: asNumber(value.expenditure),
    quantity,
    unit,
    unit_cost: unitCost,
    status: asString(value.status, "Unknown"),
    sanctioned_date: asString(value.sanctioned_date),
    last_progress_date: asString(value.last_progress_date),
    progress_percent: asNumber(value.progress_percent),
    source,
    lat: asNumber(value.lat),
    lon: asNumber(value.lon),
    risk_score: riskScore,
    risk_tier: normaliseRiskTier(value.risk_tier, riskScore),
  };
}

function normaliseFlag(value: unknown): Flag | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const workId = asString(value.work_id);
  if (!id || !workId) return null;
  const points = asNumber(value.points);
  const evidence = isRecord(value.evidence) ? value.evidence : {};

  return {
    id,
    work_id: workId,
    detector: normaliseDetector(value.detector, evidence),
    severity: normaliseSeverity(value.severity, points),
    points,
    summary: asString(value.summary, "Review evidence before recording a decision."),
    related_work_id:
      typeof value.related_work_id === "string" ? value.related_work_id : null,
    evidence,
    review_status: normaliseReviewStatus(value.review_status),
  };
}

function normaliseQueueItem(value: unknown): AuditQueueItem | null {
  if (!isRecord(value)) return null;
  const flag = normaliseFlag(value.flag);
  const work = normaliseWork(value.work ?? value.primary_work);
  return flag && work ? { flag, work } : null;
}

function normaliseDistrict(value: unknown): DistrictSummary | null {
  if (!isRecord(value)) return null;
  const district = asString(value.district);
  if (!district) return null;
  const maxRisk = asNumber(value.max_risk, asNumber(value.risk_score));
  return {
    state: asString(value.state, "Unknown state"),
    district,
    total_works: asNumber(value.total_works, asNumber(value.works)),
    flagged_works: asNumber(value.flagged_works, asNumber(value.flagged)),
    pending_review: asNumber(value.pending_review, asNumber(value.open_reviews)),
    average_risk: asNumber(value.average_risk, asNumber(value.avg_risk)),
    max_risk: maxRisk,
    risk_tier: normaliseRiskTier(value.risk_tier, maxRisk),
  };
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([key, count]) => [key, count]),
  );
}

function normaliseDetectorCounts(value: unknown) {
  return Object.entries(numberRecord(value)).reduce<Record<string, number>>(
    (counts, [detector, count]) => {
      const key = aggregateDetector(detector);
      counts[key] = (counts[key] ?? 0) + count;
      return counts;
    },
    {},
  );
}

function normaliseSummary(value: unknown): DashboardSummary | null {
  if (!isRecord(value) || !isRecord(value.totals)) return null;
  const queue = Array.isArray(value.audit_queue)
    ? value.audit_queue.map(normaliseQueueItem).filter((item): item is AuditQueueItem => Boolean(item))
    : [];
  const districts = Array.isArray(value.by_district)
    ? value.by_district
        .map(normaliseDistrict)
        .filter((item): item is DistrictSummary => Boolean(item))
    : [];
  const totals = value.totals;
  return {
    totals: {
      works: asNumber(totals.works, asNumber(totals.total_works)),
      flags: asNumber(totals.flags, asNumber(totals.flagged)),
      flagged_works: asNumber(totals.flagged_works, asNumber(totals.flagged)),
      high_risk: asNumber(totals.high_risk),
      pending_review: asNumber(totals.pending_review, asNumber(totals.open_reviews)),
      sanction_amount: asNumber(totals.sanction_amount),
    },
    detector_counts: normaliseDetectorCounts(value.detector_counts),
    provenance_counts: numberRecord(value.provenance_counts),
    by_district: districts,
    audit_queue: queue,
  };
}

function normaliseSignal(value: unknown): RiskSignal | null {
  if (!isRecord(value)) return null;
  const label = asString(value.label);
  if (!label) return null;
  return {
    label,
    value: asString(value.value),
    points: asNumber(value.points),
    explanation: asString(value.explanation, asString(value.detail)),
  };
}

function normaliseTextMatch(value: unknown): TextMatch | null {
  if (!isRecord(value)) return null;
  const primaryText = asString(value.primary_text, asString(value.primary));
  const relatedText = asString(value.related_text, asString(value.related));
  if (!primaryText || !relatedText) return null;
  const rawScore = asNumber(value.score, asNumber(value.similarity));
  const score = rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore);
  const commonTerms = Array.isArray(value.common_terms)
    ? value.common_terms.filter((term): term is string => typeof term === "string")
    : [];
  const longestFirst = [...commonTerms].sort((a, b) => b.length - a.length);
  const primaryMatch =
    asString(value.primary_match) ||
    longestFirst.find((term) =>
      primaryText.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    ) ||
    "";
  const relatedMatch =
    asString(value.related_match) ||
    longestFirst.find((term) =>
      relatedText.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    ) ||
    "";
  const containsDevanagari = /[\u0900-\u097f]/u.test(`${primaryText}${relatedText}`);
  return {
    language_pair: asString(
      value.language_pair,
      asString(value.language, containsDevanagari ? "English ↔ Hindi" : "Cross-language"),
    ),
    score,
    score_label: asString(
      value.score_label,
      value.field ? `${asString(value.field)} similarity` : "Pair similarity",
    ),
    primary_text: primaryText,
    related_text: relatedText,
    primary_match: primaryMatch,
    related_match: relatedMatch,
    canonical_terms: commonTerms,
    method_note: asString(
      value.method_note,
      "This score prioritises human review; it does not determine the decision.",
    ),
  };
}

function normalisePhotoEvidence(value: unknown): PhotoEvidence {
  if (!isRecord(value)) {
    return {
      status: "not_available",
      summary: "No photo evidence was returned for this review.",
      primary_reference: null,
      related_reference: null,
      primary_url: null,
      related_url: null,
      details: {},
    };
  }
  const rawStatus = asString(value.status);
  const status =
    rawStatus === "flagged" || rawStatus === "not_flagged" ? rawStatus : "not_available";
  return {
    status,
    summary: asString(value.summary, "No photo evidence summary was returned."),
    primary_reference:
      typeof value.primary_reference === "string" ? value.primary_reference : null,
    related_reference:
      typeof value.related_reference === "string" ? value.related_reference : null,
    primary_url: resolveAssetUrl(value.primary_url),
    related_url: resolveAssetUrl(value.related_url),
    details: isRecord(value.details) ? value.details : {},
  };
}

function normaliseRiskComponent(value: unknown): RiskComponent | null {
  if (!isRecord(value)) return null;
  const detector = normaliseDetector(value.detector);
  const flagIds = Array.isArray(value.flag_ids)
    ? value.flag_ids.filter((flagId): flagId is string => typeof flagId === "string")
    : [];
  return {
    detector,
    points: asNumber(value.points),
    maximum_points: asNumber(value.maximum_points),
    flag_ids: flagIds,
    explanation: asString(value.explanation),
  };
}

function normaliseRisk(value: unknown): RiskScore | null {
  if (!isRecord(value)) return null;
  const workId = asString(value.work_id);
  if (!workId) return null;
  const totalScore = asNumber(value.total_score);
  const components = Array.isArray(value.components)
    ? value.components
        .map(normaliseRiskComponent)
        .filter((component): component is RiskComponent => Boolean(component))
    : [];
  return {
    work_id: workId,
    total_score: totalScore,
    tier: normaliseRiskTier(value.tier, totalScore),
    components,
    explanation: asString(value.explanation),
  };
}

function normaliseEvidence(value: unknown): EvidenceResponse | null {
  if (!isRecord(value)) return null;
  const flag = normaliseFlag(value.flag);
  const primaryWork = normaliseWork(value.primary_work);
  const relatedWork = normaliseWork(value.related_work);
  const risk = normaliseRisk(value.risk);
  if (
    !flag ||
    !primaryWork ||
    !risk ||
    flag.work_id !== primaryWork.id ||
    risk.work_id !== primaryWork.id
  ) {
    return null;
  }
  const signals = Array.isArray(value.signals)
    ? value.signals.map(normaliseSignal).filter((item): item is RiskSignal => Boolean(item))
    : [];
  const textMatches = Array.isArray(value.text_matches)
    ? value.text_matches
        .map(normaliseTextMatch)
        .filter((item): item is TextMatch => Boolean(item))
    : [];

  return {
    flag,
    primary_work: primaryWork,
    related_work: relatedWork,
    risk,
    signals,
    text_matches: textMatches,
    photo_evidence: normalisePhotoEvidence(value.photo_evidence),
  };
}

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`Request returned ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadDashboard(role: RoleMode): Promise<ApiResult<DashboardSummary>> {
  try {
    const params = new URLSearchParams({ role });
    if (role === "state" || role === "district" || role === "mp") {
      params.set("state", "Uttar Pradesh");
    }
    if (role === "district" || role === "mp") {
      params.set("district", "Varanasi");
    }
    if (role === "mp") {
      params.set("mp", "Demo MP Kavita Mishra");
    }
    const raw = await fetchJson(`/dashboard-summary?${params.toString()}`);
    const data = normaliseSummary(raw);
    if (!data) throw new Error("Dashboard response did not match the expected schema");
    return {
      data,
      mode: "api",
      message: "FastAPI connected. Provenance labels come from the returned records.",
    };
  } catch {
    return {
      data: getDemoSummary(role),
      mode: "demo",
      message:
        "Live API unavailable or incompatible. Static synthetic fallback from demo.ts is active.",
    };
  }
}

export async function loadEvidence(
  flagId: string,
): Promise<ApiResult<EvidenceResponse | null>> {
  try {
    const raw = await fetchJson(`/flags/${encodeURIComponent(flagId)}/evidence`);
    const data = normaliseEvidence(raw);
    if (!data || data.flag.id !== flagId) {
      throw new Error("Evidence response did not match the requested flag");
    }
    return {
      data,
      mode: "api",
      message: "Evidence loaded from FastAPI.",
    };
  } catch {
    const data = getDemoEvidence(flagId);
    return {
      data,
      mode: "demo",
      message: data
        ? "Showing exact synthetic evidence from the static fallback."
        : `Evidence for ${flagId} is unavailable; no other flag was substituted.`,
    };
  }
}

export async function saveReviewStatus(
  flagId: string,
  status: ReviewStatus,
): Promise<Flag | null> {
  try {
    const raw = await fetchJson(`/flags/${encodeURIComponent(flagId)}/review`, {
      method: "PATCH",
      body: JSON.stringify({ review_status: status }),
    });
    const flag = normaliseFlag(raw);
    return flag?.id === flagId ? flag : null;
  } catch {
    return null;
  }
}
