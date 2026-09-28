import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Database,
  FilterX,
  Image,
  Info,
  Landmark,
  ListFilter,
  LoaderCircle,
  LogOut,
  MapPinned,
  MessageSquareWarning,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { loadDashboard, loadEvidence, saveReviewStatus } from "./api";
import {
  CommandPalette,
  type CommandItem,
} from "./components/CommandPalette";
import { EvidencePanel } from "./components/EvidencePanel";
import { LoginPage } from "./components/LoginPage";
import { RiskBadge } from "./components/RiskBadge";
import { RoleSwitcher } from "./components/RoleSwitcher";
import { SignupPage } from "./components/SignupPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
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

const detectorDescriptions: Record<string, string> = {
  duplicate_work: "Cross-lingual title overlap & co-located duplicate asset detection",
  unit_cost_outlier: "Normalized unit cost exceeding district & category baseline distributions",
  stalled_work: "Disproportionate elapsed time with zero physical progress milestones",
  photo: "Visual perceptual similarity, metadata mismatch, or quality degradation",
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
  maximumFractionDigits: 2,
});

const fullCurrencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
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

function initialFlagFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get("flag") || "";
  } catch {
    return "";
  }
}

function detectorIcon(detector: string) {
  if (detector === "duplicate_work") return <Copy aria-hidden="true" size={15} strokeWidth={2} />;
  if (detector === "unit_cost_outlier") return <Scale aria-hidden="true" size={15} strokeWidth={2} />;
  if (detector === "stalled_work") return <Clock3 aria-hidden="true" size={15} strokeWidth={2} />;
  return <Image aria-hidden="true" size={15} strokeWidth={2} />;
}

function isPhotoDetector(detector: string) {
  return detector === "photo" || detector === "photo_reuse" || detector === "photo_quality";
}

function reviewStatusLabel(status: ReviewStatus) {
  if (status === "reviewed") return "Reviewed";
  if (status === "disputed") return "Disputed";
  if (status === "dismissed") return "Dismissed";
  if (status === "needs_follow_up") return "Needs follow-up";
  return "Pending review";
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
      <Icon aria-hidden="true" size={13} strokeWidth={2} />
      <span>{reviewStatusLabel(status)}</span>
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
  if (role === "state") return "State & District Anomaly Overview";
  if (role === "district") return "District Audit & Inspection Workspace";
  if (role === "mp") return "Constituency Recommended-Work Review";
  return "National MPLADS Anomaly Review & Audit Intelligence";
}

function WorkbenchApp() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [role, setRole] = useState<RoleMode>(initialRole);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [apiMode, setApiMode] = useState<"api" | "demo">("demo");
  const [apiMessage, setApiMessage] = useState(
    "Checking FastAPI connection. Local-first fallback active if unreachable.",
  );
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [selectedFlagId, setSelectedFlagId] = useState(initialFlagFromUrl);
  const [isDetailOpen, setIsDetailOpen] = useState(Boolean(initialFlagFromUrl()));
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceMessage, setEvidenceMessage] = useState(
    "Select any flagged work from the audit queue to inspect exact evidence.",
  );
  const [actionPending, setActionPending] = useState(false);
  const [actionMessage, setActionMessage] = useState(
    "Review determinations require human authority inspection.",
  );
  const [queueSearch, setQueueSearch] = useState("");
  const [detectorFilter, setDetectorFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<"all" | RiskTier>("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const auditRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Synchronize route paths
  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
      try {
        const flagParam = new URLSearchParams(window.location.search).get("flag");
        if (flagParam) {
          setSelectedFlagId(flagParam);
          setIsDetailOpen(true);
        } else {
          setIsDetailOpen(false);
        }
      } catch {
        // no-op
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    setPathname(path);
  };

  // Lock body scroll when detail modal is open
  useEffect(() => {
    if (isDetailOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isDetailOpen]);

  // Handle global Escape key for detail modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isDetailOpen) {
        closeDetail();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDetailOpen]);

  // Load dashboard data when role changes or user logs in
  useEffect(() => {
    if (!isAuthenticated) return;

    try {
      window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch {
      // In-memory role fallback
    }
    setSummary(EMPTY_SUMMARY);
    setDashboardLoading(true);
    setApiMessage("Checking FastAPI backend connection…");
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
    });

    return () => {
      active = false;
    };
  }, [role, isAuthenticated]);

  useEffect(() => {
    if (!selectedFlagId) {
      setEvidence(null);
      setEvidenceLoading(false);
      setEvidenceMessage("No review flag selected in this scope.");
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
    setEvidenceMessage(`Fetching exact forensic dossier for flag ${selectedFlagId}…`);
    setActionMessage("Inspect record comparison and signal breakdown before recording decision.");
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
      : evidence?.flag.id === selectedFlagId
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
          `${item.work.id} ${item.work.title} ${item.work.district} ${item.work.state} ${item.work.mp_name} ${item.work.category}`
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
    Boolean(queueSearch) || detectorFilter !== "all" || tierFilter !== "all" || districtFilter !== "all";

  const openDetail = (flagId: string) => {
    setSelectedFlagId(flagId);
    setIsDetailOpen(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("flag", flagId);
      window.history.pushState({ flag: flagId }, "", url.toString());
    } catch {
      // no-op
    }
  };

  const closeDetail = () => {
    setIsDetailOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("flag");
      window.history.pushState({}, "", url.toString());
    } catch {
      // no-op
    }
  };

  const selectQueueItem = (item: AuditQueueItem) => {
    openDetail(item.flag.id);
  };

  const selectCommandItem = (item: CommandItem) => {
    if (item.kind === "work") {
      const flagId = item.id.replace("work:", "");
      openDetail(flagId);
      return;
    }
    const district = item.id.split(":").slice(2).join(":");
    setDistrictFilter(district);
    window.requestAnimationFrame(() =>
      auditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const selectDistrict = (district: string) => {
    setDistrictFilter((current) => (current === district ? "all" : district));
    window.requestAnimationFrame(() =>
      auditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const clearFilters = () => {
    setQueueSearch("");
    setDetectorFilter("all");
    setTierFilter("all");
    setDistrictFilter("all");
  };

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeDetail();
    }
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
        ? "Recording decision: Mark reviewed & cleared…"
        : "Recording decision: Dispute flag / Request field audit…",
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
          ? "Decision saved to FastAPI backend: Flag cleared."
          : saved.review_status === "disputed"
            ? "Dispute saved to FastAPI backend: Field audit requested."
            : `FastAPI saved status: ${reviewStatusLabel(saved.review_status)}.`,
      );
    } else {
      setActionMessage(
        status === "reviewed"
          ? "Demo session: Flag marked reviewed & cleared."
          : "Demo session: Flag marked disputed for investigation.",
      );
    }
    setActionPending(false);
  };

  // --------------------------------------------------------------------------
  // Authentication Guard Views
  // --------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-box">
          <div className="auth-loading-emblem">
            <Landmark size={32} strokeWidth={2} />
          </div>
          <div className="auth-loading-content">
            <div className="auth-loading-spinner-row">
              <LoaderCircle className="spin" size={18} strokeWidth={2} />
              <strong>Verifying Institutional Credentials…</strong>
            </div>
            <p>Connecting to secure MPLADS review session.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (pathname === "/signup") {
      return <SignupPage onNavigateLogin={() => navigateTo("/login")} />;
    }
    return <LoginPage onNavigateSignup={() => navigateTo("/signup")} />;
  }

  // --------------------------------------------------------------------------
  // Authenticated Main Application View
  // --------------------------------------------------------------------------

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to audit dashboard
      </a>

      {/* Institutional Government Header */}
      <header className="topbar">
        <div className="shell topbar__inner">
          <a className="brand" href="#main-content" aria-label="MPLADS Review workbench home">
            <span className="brand__mark" aria-hidden="true">
              <Landmark size={20} strokeWidth={1.9} />
            </span>
            <span className="brand__copy">
              <span className="brand__dept">MINISTRY OF STATISTICS & PROGRAMME IMPLEMENTATION</span>
              <strong className="brand__title">MPLADS / REVIEW WORKBENCH</strong>
            </span>
          </a>

          <div className="topbar__controls">
            <CommandPalette items={commandItems} onSelect={selectCommandItem} />
            <RoleSwitcher value={role} onChange={setRole} />

            {/* Authenticated User Menu & Logout */}
            <div className="user-profile-menu">
              <div className="user-profile-badge" title={`Logged in as ${user?.email}`}>
                <UserIcon size={14} strokeWidth={2} />
                <span className="user-profile-email">{user?.email}</span>
                <span className="user-profile-role">{user?.role}</span>
              </div>
              <button
                className="button button--logout"
                type="button"
                title="Log out of session"
                aria-label="Log out"
                onClick={logout}
              >
                <LogOut size={14} strokeWidth={2} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* Scoped Briefing & Institutional Framing */}
        <section className="shell briefing" aria-labelledby="page-title">
          <div className="briefing__copy">
            <div className="scope-pill">
              <MapPinned aria-hidden="true" size={14} strokeWidth={2} />
              <span>Scope: {scope.scope}</span>
            </div>

            <h1 id="page-title" className="briefing__title">
              {roleOverviewTitle(role)}
            </h1>

            <p className="positioning-statement">
              eSAKSHI displays data. <strong className="positioning-highlight">We interrogate it.</strong>
            </p>

            <div className="core-philosophy-banner" role="note">
              <Shield className="philosophy-icon" aria-hidden="true" size={16} strokeWidth={2} />
              <span>
                <strong>System Philosophy:</strong> The review workbench does not accuse a work.
                It compiles and prioritizes multi-factor evidence for human audit determination.
              </span>
            </div>

            <p className="role-summary">{scope.summary}</p>
          </div>

          {/* Data Provenance / Demonstration Assurance Card */}
          <aside className="provenance-panel" aria-label="Data provenance & assurance">
            <div className="provenance-panel__header">
              <Database className="provenance-panel__icon" aria-hidden="true" size={18} strokeWidth={2} />
              <div>
                <strong className="provenance-panel__title">Data Provenance & Demonstration Baseline</strong>
                <span className="provenance-panel__subtitle">Source-attributed synthetic audit dataset</span>
              </div>
            </div>

            <p className="provenance-panel__desc">
              Demonstration records are synthetically modeled on actual MPLADS work structures and
              explicitly tagged. Every record retains its provenance badge.
            </p>

            <div className="provenance-breakdown">
              <div className="provenance-chip" title="Synthetically generated test records">
                <span className="provenance-chip__count">{summary.provenance_counts.synthetic ?? 0}</span>
                <span className="provenance-chip__label">Synthetic demo</span>
              </div>
              <div className="provenance-chip" title="Scraped public eSAKSHI work records">
                <span className="provenance-chip__count">{summary.provenance_counts.real_scraped ?? 0}</span>
                <span className="provenance-chip__label">Public eSAKSHI</span>
              </div>
              <div className="provenance-chip" title="Manually compiled audit benchmark records">
                <span className="provenance-chip__count">{summary.provenance_counts.manually_compiled ?? 0}</span>
                <span className="provenance-chip__label">Compiled benchmarks</span>
              </div>
            </div>

            <div className="connection-status-pill" data-mode={apiMode} aria-live="polite">
              <span className="status-indicator" />
              <span>{dashboardLoading ? "Connecting to local API…" : apiMessage}</span>
            </div>
          </aside>
        </section>

        {/* Telemetry KPI Strip */}
        <section className="shell kpi-section" aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="sr-only">
            Scoped Review Telemetry Summary
          </h2>

          <div className="kpi-strip" aria-busy={dashboardLoading}>
            <div className="kpi-card">
              <span className="kpi-card__tag">TOTAL SCOPE</span>
              <div className="kpi-card__value">{summary.totals.works.toLocaleString("en-IN")}</div>
              <span className="kpi-card__label">Works in Scope</span>
              <span className="kpi-card__subtext">Source-labelled records</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-card__tag">ANOMALIES</span>
              <div className="kpi-card__value">{summary.totals.flagged_works.toLocaleString("en-IN")}</div>
              <span className="kpi-card__label">Flagged Works</span>
              <span className="kpi-card__subtext">Triggering review signals</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-card__tag">WORKLOAD</span>
              <div className="kpi-card__value">{summary.totals.pending_review.toLocaleString("en-IN")}</div>
              <span className="kpi-card__label">Pending Reviews</span>
              <span className="kpi-card__subtext">Awaiting human determination</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-card__tag">SIGNALS</span>
              <div className="kpi-card__value">{summary.totals.flags.toLocaleString("en-IN")}</div>
              <span className="kpi-card__label">Total Flags</span>
              <span className="kpi-card__subtext">Multi-detector detections</span>
            </div>

            <div className="kpi-card kpi-card--danger">
              <span className="kpi-card__tag kpi-card__tag--danger">ACTION REQUIRED</span>
              <div className="kpi-card__value kpi-card__value--danger">
                {summary.totals.high_risk.toLocaleString("en-IN")}
              </div>
              <span className="kpi-card__label">High Priority</span>
              <span className="kpi-card__subtext">Red tier · Score 70+</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-card__tag">SANCTIONS</span>
              <div className="kpi-card__value" title={fullCurrencyFormatter.format(summary.totals.sanction_amount)}>
                {currencyFormatter.format(summary.totals.sanction_amount)}
              </div>
              <span className="kpi-card__label">Sanctions in Scope</span>
              <span className="kpi-card__subtext">Total allocated funding</span>
            </div>
          </div>
        </section>

        {/* Overview Grid: Detectors + District Risk Ranking */}
        <div className="shell overview-grid">
          {/* Module 1: Detector Explainability */}
          <section
            className="module detector-module"
            aria-labelledby="detector-title"
            aria-busy={dashboardLoading}
          >
            <header className="module-heading">
              <div>
                <h2 id="detector-title" className="module-heading__title">
                  Why Records Entered the Review Queue
                </h2>
                <p className="module-heading__subtitle">
                  Explainable detector breakdown across all scoped flags.
                </p>
              </div>
              <span className="count-pill">{detectorTotal} flags</span>
            </header>

            <div className="detector-list">
              {detectorOrder.map((detector) => {
                const count = summary.detector_counts[detector] ?? 0;
                const percentage = detectorTotal > 0 ? Math.round((count / detectorTotal) * 100) : 0;
                return (
                  <div key={detector} className="detector-card">
                    <div className="detector-card__header">
                      <div className="detector-card__label">
                        <span className="detector-card__icon">{detectorIcon(detector)}</span>
                        <strong>{detectorLabels[detector]}</strong>
                      </div>
                      <div className="detector-card__metrics">
                        <span className="detector-card__pct">{percentage}%</span>
                        <span className="detector-card__count">{count} flags</span>
                      </div>
                    </div>

                    <div className="detector-card__bar-wrap">
                      <div
                        className="detector-card__bar-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <p className="detector-card__desc">
                      {detectorDescriptions[detector]}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="module-footer-note">
              <Info size={14} strokeWidth={2} />
              <span>Detector triggers prioritize human inspection; they do not dictate the final audit decision.</span>
            </div>
          </section>

          {/* Module 2: District Risk Ranking */}
          <section
            className="module district-module"
            aria-labelledby="district-title"
            aria-busy={dashboardLoading}
          >
            <header className="module-heading">
              <div>
                <h2 id="district-title" className="module-heading__title">
                  District Risk Ranking & Intensity
                </h2>
                <p className="module-heading__subtitle">
                  Ranked by peak work-level risk score. Click any district to filter the review queue.
                </p>
              </div>
              <span className="count-pill">{summary.by_district.length} districts</span>
            </header>

            {summary.by_district.length > 0 ? (
              <div className="district-ranking-list" role="list" aria-label="District risk ranking">
                {summary.by_district.map((district, idx) => {
                  const isSelected = districtFilter === district.district;
                  const rankNumber = String(idx + 1).padStart(2, "0");
                  return (
                    <button
                      key={`${district.state}-${district.district}`}
                      className={`district-rank-card ${isSelected ? "district-rank-card--selected" : ""}`}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => selectDistrict(district.district)}
                    >
                      <span className="rank-num">#{rankNumber}</span>

                      <div className="district-rank-card__info">
                        <div className="district-name-row">
                          <strong>{district.district}</strong>
                          <span className="state-name">{district.state}</span>
                        </div>
                        <div className="district-meta-row">
                          <span>
                            <strong>{district.pending_review}</strong> pending
                          </span>
                          <span>·</span>
                          <span>
                            <strong>{district.flagged_works}</strong> flagged
                          </span>
                          <span>·</span>
                          <span>{district.total_works} works in scope</span>
                        </div>
                      </div>

                      <div className="district-rank-card__risk">
                        <RiskBadge tier={district.risk_tier} score={district.max_risk} compact />
                        <div className="district-risk-bar">
                          <div
                            className="district-risk-fill"
                            data-tier={district.risk_tier}
                            style={{ width: `${district.max_risk}%` }}
                          />
                        </div>
                      </div>

                      <ChevronRight className="district-rank-card__chevron" size={16} strokeWidth={2} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-module-state">
                <MapPinned size={28} strokeWidth={1.5} />
                <strong>No district summaries available</strong>
                <p>
                  {dashboardLoading
                    ? "Loading district summaries from the scoped API…"
                    : "No district records found in the active role scope."}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Audit-Priority Queue Section */}
        <section
          ref={auditRef}
          className="shell audit-section"
          aria-labelledby="audit-title"
          aria-busy={dashboardLoading}
        >
          <header className="audit-section__header">
            <div>
              <div className="section-pre-title">INVESTIGATION WORKBENCH</div>
              <h2 id="audit-title" className="audit-section__title">
                Audit-Priority Review Queue
              </h2>
              <p className="audit-section__subtitle">
                Filter and inspect flagged records. Click any work to open its forensic dossier in a dedicated review sheet.
              </p>
            </div>
            <div className="queue-counter-badge" aria-live="polite">
              <strong>{filteredQueue.length}</strong>
              <span>of {summary.audit_queue.length} works</span>
            </div>
          </header>

          {/* Search & Filter Toolbar */}
          <div className="queue-toolbar">
            <div className="toolbar-search">
              <label htmlFor="queue-search" className="sr-only">
                Search queue by work title, ID, MP or district
              </label>
              <div className="toolbar-search__input-wrap">
                <Search aria-hidden="true" size={16} strokeWidth={2} />
                <input
                  id="queue-search"
                  type="search"
                  value={queueSearch}
                  placeholder="Filter by Work ID, title, MP name, district…"
                  onChange={(event) => setQueueSearch(event.target.value)}
                />
                {queueSearch ? (
                  <button
                    className="clear-input-btn"
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQueueSearch("")}
                  >
                    <FilterX size={14} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="toolbar-filters">
              <div className="toolbar-select-wrap">
                <label htmlFor="detector-filter" className="toolbar-select-label">
                  Detector:
                </label>
                <select
                  id="detector-filter"
                  value={detectorFilter}
                  onChange={(event) => setDetectorFilter(event.target.value)}
                >
                  <option value="all">All Detectors</option>
                  {detectorOrder.map((detector) => (
                    <option key={detector} value={detector}>
                      {detectorLabels[detector]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="toolbar-select-wrap">
                <label htmlFor="tier-filter" className="toolbar-select-label">
                  Priority:
                </label>
                <select
                  id="tier-filter"
                  value={tierFilter}
                  onChange={(event) =>
                    setTierFilter(event.target.value as "all" | RiskTier)
                  }
                >
                  <option value="all">All Priority Tiers</option>
                  <option value="red">High Priority · 70+</option>
                  <option value="amber">Medium Attention · 40–69</option>
                  <option value="green">Low Risk · 0–39</option>
                </select>
              </div>

              {districtFilter !== "all" ? (
                <div className="active-district-tag">
                  <span>District: {districtFilter}</span>
                  <button
                    type="button"
                    aria-label={`Clear district filter ${districtFilter}`}
                    onClick={() => setDistrictFilter("all")}
                  >
                    <FilterX size={13} />
                  </button>
                </div>
              ) : null}

              <button
                className="button button--reset-filters"
                type="button"
                disabled={!hasFilters}
                onClick={clearFilters}
              >
                <FilterX aria-hidden="true" size={14} strokeWidth={2} />
                <span>Reset Filters</span>
              </button>
            </div>
          </div>

          {/* Audit Queue Table */}
          <div className="queue-table-container">
            <div className="queue-table-header" aria-hidden="true">
              <span className="col-work">Work Title & Category</span>
              <span className="col-location">Location</span>
              <span className="col-detector">Detector Signal</span>
              <span className="col-sanction">Sanction Amount</span>
              <span className="col-decision">Review Decision</span>
              <span className="col-priority">Audit Priority</span>
            </div>

            {filteredQueue.length > 0 ? (
              <div className="queue-table-body" role="list">
                {filteredQueue.map((item) => {
                  const status = item.flag.review_status;
                  const isSelected = item.flag.id === selectedFlagId && isDetailOpen;
                  return (
                    <div key={item.flag.id} role="listitem">
                      <button
                        className={`queue-row ${isSelected ? "queue-row--selected" : ""}`}
                        type="button"
                        aria-pressed={isSelected}
                        aria-haspopup="dialog"
                        onClick={() => selectQueueItem(item)}
                      >
                        {/* Work Column */}
                        <div className="col-work">
                          <div className="work-title-wrap">
                            <strong className="work-title">{item.work.title}</strong>
                            <div className="work-meta-chips">
                              <code className="work-id-chip">{item.work.id}</code>
                              <span className="category-chip">{item.work.category}</span>
                              {item.work.mp_name ? (
                                <span className="mp-chip">MP: {item.work.mp_name}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Location Column */}
                        <div className="col-location">
                          <span className="location-district">{item.work.district}</span>
                          <span className="location-state">{item.work.state}</span>
                        </div>

                        {/* Detector Column */}
                        <div className="col-detector">
                          <span className="detector-badge">
                            {detectorIcon(item.flag.detector)}
                            <span>{detectorLabels[item.flag.detector] ?? item.flag.detector}</span>
                          </span>
                        </div>

                        {/* Sanction Column */}
                        <div className="col-sanction" title={fullCurrencyFormatter.format(item.work.sanction_amount)}>
                          <strong>{currencyFormatter.format(item.work.sanction_amount)}</strong>
                        </div>

                        {/* Decision Status Column */}
                        <div className="col-decision">
                          <ReviewStatusMark status={status} />
                        </div>

                        {/* Priority Tier Column */}
                        <div className="col-priority">
                          <RiskBadge tier={item.work.risk_tier} score={item.work.risk_score} />
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="queue-empty-state">
                <ListFilter aria-hidden="true" size={32} strokeWidth={1.5} />
                <strong>
                  {dashboardLoading
                    ? "Loading the review queue…"
                    : summary.audit_queue.length > 0
                    ? "No audit records match the current filters"
                    : "No review flags present in this scope"}
                </strong>
                <p>
                  {dashboardLoading
                    ? "Fetching prioritized records from the server…"
                    : summary.audit_queue.length > 0
                    ? "Clear search terms or filter criteria to view all scoped flags."
                    : "All works in this scope have cleared automated anomaly detection."}
                </p>
                {hasFilters ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={clearFilters}
                  >
                    Clear All Filters
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Forensic Evidence Investigation Dedicated Modal / Sheet */}
      {isDetailOpen && selectedFlagId ? (
        <div
          ref={modalRef}
          className="evidence-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Project forensic investigation dossier"
          onClick={handleBackdropClick}
        >
          <div className="evidence-modal-dialog">
            <div className="evidence-modal-scroll">
              <EvidencePanel
                evidence={visibleEvidence}
                selectedFlagId={selectedFlagId}
                isLoading={evidenceLoading}
                actionPending={actionPending}
                statusMessage={
                  dashboardLoading
                    ? "Connecting to review scope database…"
                    : `${evidenceMessage} ${actionMessage}`
                }
                onDecision={handleDecision}
                onClose={closeDetail}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Institutional Government Footer */}
      <footer className="footer">
        <div className="shell footer__content">
          <div className="footer__brand-block">
            <div className="footer__emblem">
              <Landmark size={18} strokeWidth={2} />
              <strong>MPLADS / REVIEW WORKBENCH</strong>
            </div>
            <p>
              Smart India Hackathon (SIH 2026) · Ministry of Statistics and Programme Implementation
            </p>
          </div>

          <div className="footer__notices">
            <p>
              <strong>Data Assurance Notice:</strong> Fallback demonstration dataset is synthetically compiled for audit evaluation. Source labels are preserved across all records.
            </p>
            <p className="footer__copyright">
              © 2026 Government Audit Decision-Support System · All Rights Reserved
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkbenchApp />
    </AuthProvider>
  );
}
