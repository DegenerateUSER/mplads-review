import {
  CheckCircle2,
  CircleDot,
  Clock3,
  Copy,
  Database,
  FilterX,
  Image,
  Landmark,
  ListFilter,
  MapPinned,
  MessageSquareWarning,
  Scale,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadDashboard, loadEvidence, saveReviewStatus } from "./api";
import {
  CommandPalette,
  type CommandItem,
} from "./components/CommandPalette";
import { EvidencePanel } from "./components/EvidencePanel";
import { RiskBadge } from "./components/RiskBadge";
import { RoleSwitcher } from "./components/RoleSwitcher";
import { getDemoEvidence, roleScope } from "./demo";
import type {
  AuditQueueItem,
  DashboardSummary,
  EvidenceResponse,
  Flag,
  ReviewStatus,
  RiskTier,
  RoleMode,
} from "./types";

const ROLE_STORAGE_KEY = "mplads-review-role";
const detectorOrder = [
  "duplicate_work",
  "unit_cost_outlier",
  "stalled_work",
  "photo",
];

const detectorLabels: Record<string, string> = {
  duplicate_work: "Duplicate work",
  unit_cost_outlier: "Unit-cost outlier",
  stalled_work: "Stalled work",
  photo: "Photo forensics",
  photo_reuse: "Photo reuse",
  photo_quality: "Photo quality",
  unclassified: "Unclassified signal",
};

const EMPTY_SUMMARY: DashboardSummary = {
  totals: {
    works: 0,
    flags: 0,
    flagged_works: 0,
    high_risk: 0,
    pending_review: 0,
    sanction_amount: 0,
  },
  detector_counts: {
    duplicate_work: 0,
    unit_cost_outlier: 0,
    stalled_work: 0,
    photo: 0,
  },
  provenance_counts: {
    synthetic: 0,
    real_scraped: 0,
    manually_compiled: 0,
  },
  by_district: [],
  audit_queue: [],
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

function initialRole(): RoleMode {
  try {
    const saved = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (saved === "state" || saved === "district" || saved === "mp") return saved;
  } catch {
    return "ministry";
  }
  return "ministry";
}

function detectorIcon(detector: string) {
  if (detector === "duplicate_work") return <Copy aria-hidden="true" size={16} />;
  if (detector === "unit_cost_outlier") return <Scale aria-hidden="true" size={16} />;
  if (detector === "stalled_work") return <Clock3 aria-hidden="true" size={16} />;
  return <Image aria-hidden="true" size={16} />;
}

function isPhotoDetector(detector: string) {
  return detector === "photo" || detector === "photo_reuse" || detector === "photo_quality";
}

function reviewStatusLabel(status: ReviewStatus) {
  if (status === "reviewed") return "Reviewed";
  if (status === "disputed") return "Disputed";
  if (status === "dismissed") return "Dismissed";
  if (status === "needs_follow_up") return "Needs follow-up";
  return "Pending";
}

function ReviewStatusMark({ status }: { status: ReviewStatus }) {
  const Icon =
    status === "reviewed"
      ? CheckCircle2
      : status === "disputed"
        ? MessageSquareWarning
        : status === "dismissed"
          ? FilterX
          : status === "needs_follow_up"
            ? Clock3
            : CircleDot;
  return (
    <span className="queue-review-status" data-status={status}>
      <Icon aria-hidden="true" size={14} strokeWidth={1.9} />
      {reviewStatusLabel(status)}
    </span>
  );
}

function updateSummaryFlag(
  summary: DashboardSummary,
  flagId: string,
  nextFlag: Flag,
  affectedLocations: Array<{ state: string; district: string }> = [],
): DashboardSummary {
  let pendingDelta = 0;
  let queuedLocation: { state: string; district: string } | null = null;
  let found = false;
  const auditQueue = summary.audit_queue.map((item) => {
    if (item.flag.id !== flagId) return item;
    found = true;
    queuedLocation = { state: item.work.state, district: item.work.district };
    pendingDelta =
      Number(nextFlag.review_status === "pending") -
      Number(item.flag.review_status === "pending");
    return {
      ...item,
      flag:
        nextFlag.work_id === item.flag.work_id
          ? nextFlag
          : { ...item.flag, review_status: nextFlag.review_status },
    };
  });

  if (!found) return summary;
  const locations = affectedLocations.length
    ? affectedLocations
    : queuedLocation
      ? [queuedLocation]
      : [];

  return {
    ...summary,
    totals: {
      ...summary.totals,
      pending_review: Math.max(0, summary.totals.pending_review + pendingDelta),
    },
    by_district: summary.by_district.map((district) =>
      locations.some(
        (location) =>
          district.state === location.state && district.district === location.district,
      )
        ? {
            ...district,
            pending_review: Math.max(0, district.pending_review + pendingDelta),
          }
        : district,
    ),
    audit_queue: auditQueue,
  };
}

function roleOverviewTitle(role: RoleMode) {
  if (role === "state") return "State and district overview";
  if (role === "district") return "District review overview";
  if (role === "mp") return "Recommended-work overview";
  return "National anomaly overview";
}

export default function App() {
  const [role, setRole] = useState<RoleMode>(initialRole);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [apiMode, setApiMode] = useState<"api" | "demo">("demo");
  const [apiMessage, setApiMessage] = useState(
    "Checking FastAPI. Fallback activates only if the request fails.",
  );
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [selectedFlagId, setSelectedFlagId] = useState("");
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceMessage, setEvidenceMessage] = useState(
    "Waiting for exact evidence from the selected scope.",
  );
  const [actionPending, setActionPending] = useState(false);
  const [actionMessage, setActionMessage] = useState(
    "Choose an action after inspecting the source records and signals.",
  );
  const [queueSearch, setQueueSearch] = useState("");
  const [detectorFilter, setDetectorFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<"all" | RiskTier>("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const auditRef = useRef<HTMLElement>(null);
  const evidenceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch {
      // The in-memory role still works when browser storage is unavailable.
    }
    setSummary(EMPTY_SUMMARY);
    setSelectedFlagId("");
    setDashboardLoading(true);
    setApiMessage("Checking FastAPI. Fallback activates only if the request fails.");
    setDistrictFilter("all");
    setQueueSearch("");
    setDetectorFilter("all");
    setTierFilter("all");
    let active = true;

    loadDashboard(role).then((result) => {
      if (!active) return;
      setSummary(result.data);
      setApiMode(result.mode);
      setApiMessage(result.message);
      setDashboardLoading(false);
      setSelectedFlagId((current) => {
        const currentStillVisible = result.data.audit_queue.some(
          (item) => item.flag.id === current,
        );
        return currentStillVisible ? current : result.data.audit_queue[0]?.flag.id ?? "";
      });
    });

    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    if (!selectedFlagId) {
      setEvidence(null);
      setEvidenceLoading(false);
      setEvidenceMessage("No flag is available in this scope.");
      setActionMessage("Review actions require exact evidence for a selected flag.");
      return;
    }
    const queuedStatus = summary.audit_queue.find(
      (item) => item.flag.id === selectedFlagId,
    )?.flag.review_status;
    const demoEvidence = getDemoEvidence(selectedFlagId);
    setEvidence(
      demoEvidence && queuedStatus
        ? {
            ...demoEvidence,
            flag: { ...demoEvidence.flag, review_status: queuedStatus },
          }
        : demoEvidence,
    );
    setEvidenceLoading(true);
    setEvidenceMessage(`Loading exact evidence for ${selectedFlagId}.`);
    setActionMessage("Choose an action after inspecting the source records and signals.");
    let active = true;

    loadEvidence(selectedFlagId).then((result) => {
      if (!active) return;
      setEvidence(
        result.data && result.mode === "demo" && queuedStatus
          ? {
              ...result.data,
              flag: { ...result.data.flag, review_status: queuedStatus },
            }
          : result.data,
      );
      setEvidenceMessage(result.message);
      setEvidenceLoading(false);
    });

    return () => {
      active = false;
    };
  }, [selectedFlagId]);

  const selectedQueueItem = summary.audit_queue.find(
    (item) => item.flag.id === selectedFlagId,
  );
  const visibleEvidence =
    selectedQueueItem &&
    evidence?.flag.id === selectedFlagId &&
    evidence.flag.work_id === selectedQueueItem.flag.work_id
      ? evidence
      : null;

  const commandItems = useMemo<CommandItem[]>(() => {
    const workItems = summary.audit_queue.map((item) => ({
      id: `work:${item.flag.id}`,
      kind: "work" as const,
      label: `${item.work.id} · ${item.work.title}`,
      detail: `${item.work.district}, ${item.work.state} · ${detectorLabels[item.flag.detector] ?? item.flag.detector}`,
      keywords: `${item.work.constituency} ${item.work.mp_name} ${item.work.category}`,
    }));
    const districtItems = summary.by_district.map((district) => ({
      id: `district:${district.state}:${district.district}`,
      kind: "district" as const,
      label: district.district,
      detail: `${district.state} · ${district.pending_review} pending reviews`,
      keywords: `${district.state} ${district.total_works} works`,
    }));
    return [...workItems, ...districtItems];
  }, [summary]);

  const filteredQueue = useMemo(
    () =>
      summary.audit_queue.filter((item) => {
        const term = queueSearch.trim().toLocaleLowerCase();
        const matchesSearch =
          !term ||
          `${item.work.id} ${item.work.title} ${item.work.district} ${item.work.state}`
            .toLocaleLowerCase()
            .includes(term);
        const matchesDetector =
          detectorFilter === "all" ||
          item.flag.detector === detectorFilter ||
          (detectorFilter === "photo" && isPhotoDetector(item.flag.detector));
        const matchesTier = tierFilter === "all" || item.work.risk_tier === tierFilter;
        const matchesDistrict =
          districtFilter === "all" || item.work.district === districtFilter;
        return matchesSearch && matchesDetector && matchesTier && matchesDistrict;
      }),
    [detectorFilter, districtFilter, queueSearch, summary.audit_queue, tierFilter],
  );

  const detectorTotal = Object.values(summary.detector_counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const scope = roleScope[role];
  const hasFilters =
    queueSearch || detectorFilter !== "all" || tierFilter !== "all" || districtFilter !== "all";

  const selectQueueItem = (item: AuditQueueItem) => {
    setSelectedFlagId(item.flag.id);
    window.requestAnimationFrame(() =>
      evidenceRef.current?.scrollIntoView({ block: "start" }),
    );
  };

  const selectCommandItem = (item: CommandItem) => {
    if (item.kind === "work") {
      const flagId = item.id.replace("work:", "");
      setSelectedFlagId(flagId);
      window.requestAnimationFrame(() =>
        evidenceRef.current?.scrollIntoView({ block: "start" }),
      );
      return;
    }
    const district = item.id.split(":").slice(2).join(":");
    setDistrictFilter(district);
    window.requestAnimationFrame(() => auditRef.current?.scrollIntoView({ block: "start" }));
  };

  const selectDistrict = (district: string) => {
    setDistrictFilter((current) => (current === district ? "all" : district));
    window.requestAnimationFrame(() => auditRef.current?.scrollIntoView({ block: "start" }));
  };

  const clearFilters = () => {
    setQueueSearch("");
    setDetectorFilter("all");
    setTierFilter("all");
    setDistrictFilter("all");
  };

  const handleDecision = async (status: Extract<ReviewStatus, "reviewed" | "disputed">) => {
    if (!visibleEvidence || visibleEvidence.flag.id !== selectedFlagId) {
      setActionMessage("Decision not sent: exact evidence for the selected flag is unavailable.");
      return;
    }

    const previousFlag = visibleEvidence.flag;
    const flagId = previousFlag.id;
    const optimisticFlag: Flag = { ...previousFlag, review_status: status };
    const affectedLocations = [
      {
        state: visibleEvidence.primary_work.state,
        district: visibleEvidence.primary_work.district,
      },
      ...(visibleEvidence.related_work
        ? [
            {
              state: visibleEvidence.related_work.state,
              district: visibleEvidence.related_work.district,
            },
          ]
        : []),
    ];
    setActionPending(true);
    setSummary((current) =>
      updateSummaryFlag(current, flagId, optimisticFlag, affectedLocations),
    );
    setEvidence((current) =>
      current?.flag.id === flagId ? { ...current, flag: optimisticFlag } : current,
    );
    setActionMessage(
      status === "reviewed"
        ? "Marking this flag reviewed…"
        : "Recording this flag as disputed…",
    );

    if (apiMode === "api") {
      const saved = await saveReviewStatus(flagId, status);
      if (!saved) {
        setSummary((current) =>
          updateSummaryFlag(current, flagId, previousFlag, affectedLocations),
        );
        setEvidence((current) =>
          current?.flag.id === flagId ? { ...current, flag: previousFlag } : current,
        );
        setActionMessage(
          "FastAPI did not save the decision. The optimistic change was rolled back; retry is available.",
        );
        setActionPending(false);
        return;
      }
      setSummary((current) =>
        updateSummaryFlag(current, flagId, saved, affectedLocations),
      );
      setEvidence((current) =>
        current?.flag.id === flagId
          ? {
              ...current,
              flag:
                saved.work_id === current.flag.work_id
                  ? saved
                  : { ...current.flag, review_status: saved.review_status },
            }
          : current,
      );
      setActionMessage(
        saved.review_status === "reviewed"
          ? "Review decision saved to FastAPI."
          : saved.review_status === "disputed"
            ? "Dispute saved to FastAPI."
            : `FastAPI saved status: ${reviewStatusLabel(saved.review_status)}.`,
      );
    } else {
      setActionMessage(
        status === "reviewed"
          ? "Synthetic fallback marked reviewed in this browser session."
          : "Synthetic fallback marked disputed in this browser session.",
      );
    }
    setActionPending(false);
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to dashboard
      </a>

      <header className="topbar">
        <div className="shell topbar__inner">
          <a className="brand" href="#main-content" aria-label="MPLADS Review dashboard home">
            <span className="brand__mark">
              <Landmark aria-hidden="true" size={19} strokeWidth={1.8} />
            </span>
            <span className="brand__copy">
              <strong>MPLADS / REVIEW</strong>
              <span>MPLADS review workbench</span>
            </span>
          </a>
          <CommandPalette items={commandItems} onSelect={selectCommandItem} />
          <RoleSwitcher value={role} onChange={setRole} />
        </div>
      </header>

      <main id="main-content">
        <section className="shell briefing" aria-labelledby="page-title">
          <div className="briefing__copy">
            <span className="scope-line">
              <MapPinned aria-hidden="true" size={16} strokeWidth={1.8} />
              {scope.scope}
            </span>
            <h1 id="page-title">{roleOverviewTitle(role)}</h1>
            <p className="positioning-line">
              eSAKSHI displays data. <strong>We interrogate it.</strong>
            </p>
            <p className="role-summary">{scope.summary}</p>
          </div>
          <aside className="data-notice" aria-label="Data provenance notice">
            <Database aria-hidden="true" size={21} strokeWidth={1.7} />
            <div>
              <strong>Synthetic demonstration is clearly marked</strong>
              <p>
                Static fallback records are synthetic and are not claims about actual MPLADS
                works. Every record retains a provenance badge.
              </p>
              <p className="provenance-counts">
                <span>{summary.provenance_counts.synthetic ?? 0} synthetic</span>
                <span>{summary.provenance_counts.real_scraped ?? 0} public-scraped</span>
                <span>
                  {summary.provenance_counts.manually_compiled ?? 0} manually compiled
                </span>
              </p>
              <span className="connection-note" data-mode={apiMode} aria-live="polite">
                {dashboardLoading ? "Checking local API" : apiMessage}
              </span>
            </div>
          </aside>
        </section>

        <section className="shell kpi-section" aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="sr-only">
            Scoped review summary
          </h2>
          <dl className="kpi-strip" aria-busy={dashboardLoading}>
            <div>
              <dt>Works in scope</dt>
              <dd>{summary.totals.works}</dd>
              <span>Source-labelled records</span>
            </div>
            <div>
              <dt>Flagged works</dt>
              <dd>{summary.totals.flagged_works}</dd>
              <span>Works with one or more flags</span>
            </div>
            <div>
              <dt>Pending reviews</dt>
              <dd>{summary.totals.pending_review}</dd>
              <span>Flags awaiting a decision</span>
            </div>
            <div>
              <dt>Total flags</dt>
              <dd>{summary.totals.flags}</dd>
              <span>Includes every review status</span>
            </div>
            <div>
              <dt>High priority</dt>
              <dd>{summary.totals.high_risk}</dd>
              <span>Red tier · score 70 or above</span>
            </div>
            <div>
              <dt>Sanctions in scope</dt>
              <dd>{currencyFormatter.format(summary.totals.sanction_amount)}</dd>
              <span>Synthetic when fallback is active</span>
            </div>
          </dl>
        </section>

        <div className="shell overview-grid">
          <section
            className="module detector-module"
            aria-labelledby="detector-title"
            aria-busy={dashboardLoading}
          >
            <header className="module-heading">
              <div>
                <h2 id="detector-title">Detector distribution</h2>
                <p>All scoped flags by explainable detector and review status.</p>
              </div>
              <span>{detectorTotal} total</span>
            </header>
            <div className="detector-list">
              {detectorOrder.map((detector) => {
                const count = summary.detector_counts[detector] ?? 0;
                return (
                  <div key={detector} className="detector-row">
                    <div className="detector-row__label">
                      {detectorIcon(detector)}
                      <span>{detectorLabels[detector]}</span>
                    </div>
                    <progress
                      max={Math.max(detectorTotal, 1)}
                      value={count}
                      aria-label={`${detectorLabels[detector]} ${count} of ${detectorTotal} scoped flags`}
                    />
                    <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
            <p className="module-footnote">
              Counts prioritise human review. They do not classify a work’s final status.
            </p>
          </section>

          <section
            className="module district-module"
            aria-labelledby="district-title"
            aria-busy={dashboardLoading}
          >
            <header className="module-heading">
              <div>
                <h2 id="district-title">District risk heatmap</h2>
                <p>
                  Accessible ranked list with numeric intensity from each district’s highest
                  work-level score.
                </p>
              </div>
              <span>{summary.by_district.length} districts</span>
            </header>
            {summary.by_district.length ? (
              <ul className="district-list" aria-label="District risk heatmap ranked list">
                {summary.by_district.map((district) => (
                  <li key={`${district.state}-${district.district}`}>
                    <button
                      className="district-row"
                      type="button"
                      aria-pressed={districtFilter === district.district}
                      onClick={() => selectDistrict(district.district)}
                    >
                      <span className="district-row__name">
                        <strong>{district.district}</strong>
                        <span>{district.state}</span>
                      </span>
                      <span className="district-row__count">
                        {district.pending_review} pending · {district.flagged_works} flagged
                        works · {district.total_works} works
                      </span>
                      <span className="district-row__risk">
                        <RiskBadge tier={district.risk_tier} score={district.max_risk} />
                        <span>Risk intensity {district.max_risk} / 100</span>
                        <progress
                          max={100}
                          value={district.max_risk}
                          aria-label={`${district.district} risk intensity ${district.max_risk} out of 100`}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="module-empty">
                <MapPinned aria-hidden="true" size={22} strokeWidth={1.6} />
                <strong>
                  {dashboardLoading
                    ? "Loading district summaries"
                    : "No district summaries in this scope"}
                </strong>
                <p>
                  {dashboardLoading
                    ? "Waiting for the scoped dashboard response."
                    : apiMode === "api"
                      ? "The API returned a valid empty district list."
                      : "The synthetic fallback has no districts in this scope."}
                </p>
              </div>
            )}
          </section>
        </div>

        <section
          ref={auditRef}
          className="shell audit-section"
          aria-labelledby="audit-title"
          aria-busy={dashboardLoading}
        >
          <header className="audit-heading">
            <div>
              <h2 id="audit-title">Audit-priority queue</h2>
              <p>
                Filter the scope, select a row and inspect the evidence without leaving the
                workbench.
              </p>
            </div>
            <span className="queue-count" aria-live="polite">
              {filteredQueue.length} of {summary.audit_queue.length}
            </span>
          </header>

          <div className="queue-filters">
            <div className="field field--search">
              <label htmlFor="queue-search">Queue search</label>
              <div className="field__control">
                <Search aria-hidden="true" size={16} strokeWidth={1.8} />
                <input
                  id="queue-search"
                  type="search"
                  value={queueSearch}
                  placeholder="Work ID, title or district"
                  onChange={(event) => setQueueSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="detector-filter">Detector</label>
              <select
                id="detector-filter"
                value={detectorFilter}
                onChange={(event) => setDetectorFilter(event.target.value)}
              >
                <option value="all">All detectors</option>
                {detectorOrder.map((detector) => (
                  <option key={detector} value={detector}>
                    {detectorLabels[detector]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tier-filter">Priority tier</label>
              <select
                id="tier-filter"
                value={tierFilter}
                onChange={(event) =>
                  setTierFilter(event.target.value as "all" | RiskTier)
                }
              >
                <option value="all">All tiers</option>
                <option value="red">Red · 70+</option>
                <option value="amber">Amber · 40–69</option>
                <option value="green">Green · 0–39</option>
              </select>
            </div>
            <button
              className="button button--clear"
              type="button"
              disabled={!hasFilters}
              onClick={clearFilters}
            >
              <FilterX aria-hidden="true" size={16} strokeWidth={1.8} />
              Clear filters
            </button>
          </div>

          <div className="queue">
            <div className="queue-header" aria-hidden="true">
              <span>Work</span>
              <span>Location</span>
              <span>Detector</span>
              <span>Sanction</span>
              <span>Decision</span>
              <span>Priority</span>
            </div>
            {filteredQueue.length ? (
              <ul className="queue-list">
                {filteredQueue.map((item) => {
                  const status = item.flag.review_status;
                  const selected = item.flag.id === selectedFlagId;
                  return (
                    <li key={item.flag.id}>
                      <button
                        className="queue-row"
                        data-selected={selected}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => selectQueueItem(item)}
                      >
                        <span className="queue-row__work">
                          <strong>{item.work.title}</strong>
                          <span>
                            {item.work.id} · {item.work.category}
                          </span>
                        </span>
                        <span className="queue-row__location">
                          <strong>{item.work.district}</strong>
                          <span>{item.work.state}</span>
                        </span>
                        <span className="queue-row__detector">
                          {detectorIcon(item.flag.detector)}
                          {detectorLabels[item.flag.detector] ?? item.flag.detector}
                        </span>
                        <span className="queue-row__amount">
                          {currencyFormatter.format(item.work.sanction_amount)}
                        </span>
                        <ReviewStatusMark status={status} />
                        <RiskBadge tier={item.work.risk_tier} score={item.work.risk_score} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="queue-empty">
                <ListFilter aria-hidden="true" size={24} strokeWidth={1.6} />
                <strong>
                  {dashboardLoading
                    ? "Loading the review queue"
                    : summary.audit_queue.length
                    ? "No queue rows match these filters"
                    : "No review flags in this scope"}
                </strong>
                <p>
                  {dashboardLoading
                    ? "Waiting for the scoped dashboard response."
                    : summary.audit_queue.length
                    ? "Clear one or more filters to restore the scoped review queue."
                    : apiMode === "api"
                      ? "The API returned a valid empty audit queue; no fallback rows were added."
                      : "The synthetic fallback has no review flags in this scope."}
                </p>
                {hasFilters ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <section
          ref={evidenceRef}
          className="evidence-band"
          aria-label="Selected work evidence"
        >
          <EvidencePanel
            evidence={visibleEvidence}
            selectedFlagId={selectedFlagId}
            isLoading={evidenceLoading}
            actionPending={actionPending}
            statusMessage={
              dashboardLoading
                ? "Loading the review scope before selecting exact evidence."
                : `${evidenceMessage} ${actionMessage}`
            }
            onDecision={handleDecision}
          />
        </section>
      </main>

      <footer className="footer">
        <div className="shell footer__line">
          <strong>MPLADS / REVIEW</strong>
          <span>SIH 2026 · MPLADS anomaly review decision-support</span>
          <span>Fallback records are synthetic · source labels retained</span>
        </div>
      </footer>
    </div>
  );
}
