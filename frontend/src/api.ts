import { getDemoEvidence, getDemoSummary } from "./demo";
import type {
  ApiResult,
  AuditQueueItem,
  AuthResponse,
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
  User,
  Work,
} from "./types";

const DEFAULT_API_URL = "http://localhost:8000/api";
const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
const API_BASE_URL = API_URL.endsWith("/api") ? API_URL.slice(0, -4) : API_URL;
const REQUEST_TIMEOUT_MS = 3_000;
const API_ORIGIN = (() => {
  try {
    return new URL(API_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
})();

// --------------------------------------------------------------------------
// In-Memory Token Management & Single-Flight Refresh
// --------------------------------------------------------------------------

let inMemoryAccessToken: string | null = null;
let authExpiredCallback: (() => void) | null = null;
let singleFlightRefreshPromise: Promise<string | null> | null = null;

export function setAuthToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryAccessToken;
}

export function setOnAuthExpired(callback: (() => void) | null) {
  authExpiredCallback = callback;
}

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
  const unitCost =
    typeof value.unit_cost === "number"
      ? value.unit_cost
      : quantity && quantity > 0
        ? Math.round((asNumber(value.sanction_amount) / quantity) * 100) / 100
        : undefined;

  const rawSource = asString(value.source, "synthetic");
  const source =
    rawSource === "real_scraped" ||
    rawSource === "manually_compiled" ||
    rawSource === "synthetic"
      ? rawSource
      : "synthetic";

  return {
    id,
    title: asString(value.title, "Untitled Work"),
    description: asString(value.description),
    state: asString(value.state, "Unknown State"),
    district: asString(value.district, "Unknown District"),
    constituency: asString(value.constituency, "Unknown Constituency"),
    mp_name: asString(value.mp_name, "Unassigned MP"),
    category: asString(value.category, "General Infrastructure"),
    sanction_amount: asNumber(value.sanction_amount),
    expenditure: asNumber(value.expenditure),
    quantity,
    unit,
    unit_cost: unitCost,
    status: asString(value.status, "Sanctioned"),
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
    detector: aggregateDetector(value.detector),
    severity: normaliseSeverity(value.severity, points),
    points,
    summary: asString(value.summary, "Flagged for manual audit review."),
    related_work_id:
      typeof value.related_work_id === "string" && value.related_work_id.trim()
        ? value.related_work_id.trim()
        : null,
    evidence,
    review_status: normaliseReviewStatus(value.review_status),
  };
}

function normaliseDistrict(value: unknown): DistrictSummary | null {
  if (!isRecord(value)) return null;
  const district = asString(value.district);
  const state = asString(value.state);
  if (!district || !state) return null;
  const maxRisk = asNumber(value.max_risk);
  return {
    state,
    district,
    total_works: asNumber(value.total_works),
    flagged_works: asNumber(value.flagged_works),
    pending_review: asNumber(value.pending_review),
    average_risk: asNumber(value.average_risk),
    max_risk: maxRisk,
    risk_tier: normaliseRiskTier(value.risk_tier, maxRisk),
  };
}

function normaliseQueueItem(value: unknown): AuditQueueItem | null {
  if (!isRecord(value)) return null;
  const flag = normaliseFlag(value.flag);
  const work = normaliseWork(value.work);
  if (!flag || !work) return null;
  return { flag, work };
}

function normaliseSummary(value: unknown): DashboardSummary | null {
  if (!isRecord(value) || !isRecord(value.totals)) return null;
  const rawTotals = value.totals;
  const rawDetectors = isRecord(value.detector_counts) ? value.detector_counts : {};
  const rawProvenance = isRecord(value.provenance_counts) ? value.provenance_counts : {};

  const byDistrict = Array.isArray(value.by_district)
    ? value.by_district
        .map(normaliseDistrict)
        .filter((item): item is DistrictSummary => Boolean(item))
    : [];

  const auditQueue = Array.isArray(value.audit_queue)
    ? value.audit_queue
        .map(normaliseQueueItem)
        .filter((item): item is AuditQueueItem => Boolean(item))
    : [];

  const detectorCounts: Record<string, number> = {
    duplicate_work:
      asNumber(rawDetectors.duplicate_work) + asNumber(rawDetectors.duplicate),
    unit_cost_outlier:
      asNumber(rawDetectors.unit_cost_outlier) + asNumber(rawDetectors.cost_outlier),
    stalled_work:
      asNumber(rawDetectors.stalled_work) + asNumber(rawDetectors.stall),
    photo:
      asNumber(rawDetectors.photo) +
      asNumber(rawDetectors.photo_reuse) +
      asNumber(rawDetectors.photo_quality),
  };

  const provenanceCounts: Record<string, number> = {
    synthetic: asNumber(rawProvenance.synthetic),
    real_scraped: asNumber(rawProvenance.real_scraped),
    manually_compiled: asNumber(rawProvenance.manually_compiled),
  };

  return {
    totals: {
      works: asNumber(rawTotals.works),
      flags: asNumber(rawTotals.flags),
      flagged_works: asNumber(rawTotals.flagged_works ?? rawTotals.flagged),
      high_risk: asNumber(rawTotals.high_risk),
      pending_review: asNumber(rawTotals.pending_review),
      sanction_amount: asNumber(rawTotals.sanction_amount),
    },
    detector_counts: detectorCounts,
    provenance_counts: provenanceCounts,
    by_district: byDistrict,
    audit_queue: auditQueue,
  };
}

function normaliseTextMatch(value: unknown): TextMatch | null {
  if (!isRecord(value)) return null;
  const primaryText = asString(value.primary_text);
  const relatedText = asString(value.related_text);
  if (!primaryText || !relatedText) return null;
  const commonTerms = Array.isArray(value.common_terms)
    ? value.common_terms.filter((item): item is string => typeof item === "string")
    : [];
  const canonicalTerms = Array.isArray(value.canonical_terms)
    ? value.canonical_terms.filter((item): item is string => typeof item === "string")
    : [];
  const similarity = asNumber(value.similarity);
  const score = Math.round(similarity * 100);
  return {
    language_pair: asString(value.language_pair, "EN-HI"),
    score,
    score_label:
      score >= 80 ? "High semantic overlap" : score >= 60 ? "Moderate overlap" : "Low overlap",
    primary_text: primaryText,
    related_text: relatedText,
    primary_match: asString(value.primary_match, commonTerms[0] || ""),
    related_match: asString(value.related_match, commonTerms[0] || ""),
    canonical_terms: canonicalTerms.length ? canonicalTerms : commonTerms,
    method_note: asString(
      value.method_note,
      "Cross-lingual gloss match with RapidFuzz token set ratio scoring.",
    ),
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
    explanation: asString(
      value.explanation,
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

// --------------------------------------------------------------------------
// Centralized HTTP Client with Single-Flight 401 Refresh Mutex
// --------------------------------------------------------------------------

async function executeRefreshToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      setAuthToken(null);
      return null;
    }
    const payload = await response.json();
    if (payload?.access_token) {
      setAuthToken(payload.access_token);
      return payload.access_token;
    }
    setAuthToken(null);
    return null;
  } catch {
    setAuthToken(null);
    return null;
  }
}

async function requestRefreshToken(): Promise<string | null> {
  if (!singleFlightRefreshPromise) {
    singleFlightRefreshPromise = executeRefreshToken().finally(() => {
      singleFlightRefreshPromise = null;
    });
  }
  return singleFlightRefreshPromise;
}

async function fetchJson(
  path: string,
  init?: RequestInit,
  isRetry = false,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const targetUrl = path.startsWith("http")
    ? path
    : path.startsWith("/auth")
      ? `${API_BASE_URL}${path}`
      : `${API_URL}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers as Record<string, string>),
  };

  if (inMemoryAccessToken && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${inMemoryAccessToken}`;
  }

  try {
    const response = await fetch(targetUrl, {
      ...init,
      signal: controller.signal,
      credentials: "include",
      headers,
    });

    if (response.status === 401 && !isRetry && !path.startsWith("/auth/")) {
      const newToken = await requestRefreshToken();
      if (newToken) {
        return await fetchJson(path, init, true);
      } else {
        authExpiredCallback?.();
        throw new Error("Session expired. Please log in again.");
      }
    }

    if (!response.ok) {
      let detail = `Request returned ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) {
          detail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        // no-op
      }
      throw new Error(detail);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

// --------------------------------------------------------------------------
// Authentication API Methods
// --------------------------------------------------------------------------

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const raw = await fetchJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const data = raw as AuthResponse;
  if (data?.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function apiSignup(
  email: string,
  password: string,
  role?: string,
): Promise<AuthResponse> {
  const raw = await fetchJson("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
  const data = raw as AuthResponse;
  if (data?.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function apiRefresh(): Promise<AuthResponse> {
  const raw = await fetchJson("/auth/refresh", {
    method: "POST",
  });
  const data = raw as AuthResponse;
  if (data?.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function apiLogout(): Promise<void> {
  try {
    await fetchJson("/auth/logout", {
      method: "POST",
    });
  } catch {
    // Ignore network errors during logout
  } finally {
    setAuthToken(null);
  }
}

export async function apiGetMe(): Promise<User> {
  const raw = await fetchJson("/auth/me");
  return raw as User;
}

// --------------------------------------------------------------------------
// Review Workbench Scoped Data Methods
// --------------------------------------------------------------------------

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
  } catch (err: unknown) {
    const isAuthError =
      err instanceof Error &&
      (err.message.includes("401") ||
        err.message.includes("Session expired") ||
        err.message.includes("Not authenticated"));
    return {
      data: getDemoSummary(role),
      mode: "demo",
      message: isAuthError
        ? "FastAPI requires authentication. Static synthetic review fallback active."
        : "Live API unavailable or incompatible. Static synthetic fallback active.",
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
