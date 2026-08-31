import {
  AlertOctagon,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  HelpCircle,
  Image,
  Languages,
  Layers,
  Link2,
  LoaderCircle,
  MapPin,
  MessageSquareWarning,
  Scale,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  DataSource,
  EvidenceResponse,
  ReviewStatus,
  TextMatch,
  Work,
} from "../types";
import { RiskBadge } from "./RiskBadge";

interface EvidencePanelProps {
  evidence: EvidenceResponse | null;
  selectedFlagId: string;
  isLoading: boolean;
  actionPending: boolean;
  statusMessage: string;
  onDecision: (status: Extract<ReviewStatus, "reviewed" | "disputed">) => void;
  onClose?: () => void;
}

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

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const quantityFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

const provenanceLabels: Record<DataSource, string> = {
  real_scraped: "Public eSAKSHI",
  manually_compiled: "Manually compiled",
  synthetic: "Synthetic demo",
};

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: "Pending review",
  reviewed: "Reviewed & cleared",
  disputed: "Disputed flag",
  dismissed: "Dismissed signal",
  needs_follow_up: "Needs field follow-up",
};

const detectorLabels: Record<string, string> = {
  duplicate_work: "Duplicate work",
  unit_cost_outlier: "Unit-cost outlier",
  stalled_work: "Stalled work",
  photo: "Photo forensics",
  photo_reuse: "Photo reuse",
  photo_quality: "Photo quality",
  unclassified: "Unclassified signal",
};

function detectorLabel(detector: string) {
  return detectorLabels[detector] ?? detector.replaceAll("_", " ");
}

function formatDate(value: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function highlightMatch(text: string, match: string): ReactNode {
  if (!match) return text;
  const index = text.toLocaleLowerCase().indexOf(match.toLocaleLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="match-highlight">{text.slice(index, index + match.length)}</mark>
      {text.slice(index + match.length)}
    </>
  );
}

function calculateCostDelta(primary: Work, comparison?: Work | null) {
  if (!comparison || !primary.sanction_amount || !comparison.sanction_amount) return null;
  const diff = primary.sanction_amount - comparison.sanction_amount;
  const pct = Math.round((diff / comparison.sanction_amount) * 100);
  return {
    diff,
    pct,
    label: pct > 0 ? `+${pct}% vs comparison` : `${pct}% vs comparison`,
  };
}

function WorkRecord({
  work,
  label,
  badgeType = "primary",
  isComparison = false,
}: {
  work: Work;
  label: string;
  badgeType?: "primary" | "comparison";
  isComparison?: boolean;
}) {
  return (
    <article className={`work-record ${isComparison ? "work-record--comparison" : "work-record--primary"}`}>
      <div className="work-record__topline">
        <div className="work-record__tag-group">
          <span className={`work-record__role-badge work-record__role-badge--${badgeType}`}>
            {label}
          </span>
          <span className="work-record__source-badge" data-source={work.source}>
            <Database aria-hidden="true" size={12} strokeWidth={2} />
            {provenanceLabels[work.source]}
          </span>
        </div>
        <code className="work-record__id">{work.id}</code>
      </div>

      <div className="work-record__header">
        <h4 className="work-record__title">{work.title}</h4>
        <p className="work-record__description">{work.description}</p>
      </div>

      <dl className="work-record__facts">
        <div className="fact-item">
          <dt>Location</dt>
          <dd>
            <MapPin aria-hidden="true" size={13} strokeWidth={2} />
            <span>{work.district}, {work.state}</span>
          </dd>
        </div>

        <div className="fact-item">
          <dt>Sanction Amount</dt>
          <dd className="fact-item__amount" title={fullCurrencyFormatter.format(work.sanction_amount)}>
            <strong>{currencyFormatter.format(work.sanction_amount)}</strong>
          </dd>
        </div>

        {typeof work.quantity === "number" ? (
          <div className="fact-item">
            <dt>Sanctioned Scope</dt>
            <dd>
              {quantityFormatter.format(work.quantity)}
              {work.unit ? ` ${work.unit}` : " units"}
            </dd>
          </div>
        ) : null}

        {typeof work.unit_cost === "number" ? (
          <div className="fact-item fact-item--highlight">
            <dt>Normalized Unit Cost</dt>
            <dd>
              <strong>{currencyFormatter.format(work.unit_cost)}</strong>
              <span>{work.unit ? ` / ${work.unit}` : " / unit"}</span>
            </dd>
          </div>
        ) : null}

        <div className="fact-item">
          <dt>Sanction Date</dt>
          <dd>{formatDate(work.sanctioned_date)}</dd>
        </div>

        <div className="fact-item">
          <dt>Last Recorded Progress</dt>
          <dd>{formatDate(work.last_progress_date)}</dd>
        </div>
      </dl>

      <div className="work-record__progress">
        <div className="work-record__progress-header">
          <span>Physical Progress</span>
          <strong>{work.progress_percent}%</strong>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, work.progress_percent))}%` }}
          />
        </div>
      </div>
    </article>
  );
}

function TextMatchBlock({ match }: { match: TextMatch }) {
  return (
    <article className="text-match-card">
      <div className="text-match-card__header">
        <div className="text-match-card__lang">
          <Languages aria-hidden="true" size={15} strokeWidth={2} />
          <span>Cross-Lingual Match ({match.language_pair})</span>
        </div>
        <div className="text-match-card__score">
          <Sparkles aria-hidden="true" size={13} strokeWidth={2} />
          <strong>{match.score}/100 Match Confidence</strong>
          <span>· {match.score_label}</span>
        </div>
      </div>

      <div className="text-match-card__comparison">
        <div className="match-pane match-pane--en">
          <span className="match-pane__lang-badge">EN (Primary)</span>
          <p lang="en">{highlightMatch(match.primary_text, match.primary_match)}</p>
        </div>
        <div className="match-connector" aria-hidden="true">
          <Link2 size={16} strokeWidth={2} />
        </div>
        <div className="match-pane match-pane--hi">
          <span className="match-pane__lang-badge">HI (Comparison)</span>
          <p lang="hi">{highlightMatch(match.related_text, match.related_match)}</p>
        </div>
      </div>

      {match.canonical_terms && match.canonical_terms.length > 0 ? (
        <div className="text-match-card__canonical">
          <span className="canonical-label">
            <Layers aria-hidden="true" size={13} strokeWidth={2} />
            Identified Semantic Concepts:
          </span>
          <div className="canonical-chips">
            {match.canonical_terms.map((term) => (
              <span key={term} className="canonical-chip">
                {term}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="text-match-card__footer">
        <p>{match.method_note}</p>
      </div>
    </article>
  );
}

export function EvidencePanel({
  evidence,
  selectedFlagId,
  isLoading,
  actionPending,
  statusMessage,
  onDecision,
  onClose,
}: EvidencePanelProps) {
  if (!evidence) {
    return (
      <div className="evidence-shell" aria-busy={isLoading}>
        {onClose ? (
          <div className="evidence-modal-topbar">
            <div className="evidence-modal-breadcrumb">
              <FileText size={14} />
              <span>Audit Queue</span>
              <span>/</span>
              <strong>Inspection Dossier</strong>
            </div>
            <button
              className="evidence-modal-close-btn"
              type="button"
              aria-label="Close dossier (Esc)"
              onClick={onClose}
            >
              <span>Return to Queue</span>
              <kbd>Esc</kbd>
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        ) : null}

        <div className="evidence-empty-slate">
          <FileText aria-hidden="true" size={32} strokeWidth={1.5} />
          <h3>Select a flagged work to begin evidence inspection</h3>
          <p>
            Choose any record from the audit-priority queue above. The workbench will load the
            record comparison, multi-factor risk decomposition, and cross-source evidence for human decision.
          </p>
          <div className="evidence-empty-slate__notice">
            <HelpCircle size={15} strokeWidth={2} />
            <span>Review actions remain locked until an exact flag is selected.</span>
          </div>
        </div>
      </div>
    );
  }

  const reviewStatus = evidence.flag.review_status;
  const componentPoints = evidence.risk.components.reduce(
    (sum, component) => sum + component.points,
    0,
  );
  const comparedWork = evidence.related_work;
  const costDelta = calculateCostDelta(evidence.primary_work, comparedWork);
  const hasPhotoAssets = Boolean(
    evidence.photo_evidence.primary_url || evidence.photo_evidence.related_url,
  );

  const photoStatusLabel =
    evidence.photo_evidence.status === "not_available"
      ? "No photo assets supplied for this work"
      : evidence.photo_evidence.status === "not_flagged"
        ? "Photo forensics clean · no visual reuse signal detected"
        : evidence.flag.detector === "photo_quality"
          ? "Photo quality signal flagged for human review"
          : evidence.flag.detector === "photo_reuse"
            ? "Photo reuse signal flagged for human review"
            : "Photo forensics signal needs human inspection";

  return (
    <div className="evidence-shell" aria-busy={isLoading}>
      {/* Modal Sticky Top Navigation Bar */}
      {onClose ? (
        <div className="evidence-modal-topbar">
          <div className="evidence-modal-breadcrumb">
            <FileText size={14} />
            <span>Audit-Priority Queue</span>
            <span>/</span>
            <strong>Record Dossier: {evidence.flag.id}</strong>
            <span className="breadcrumb-work-id">· {evidence.primary_work.id}</span>
          </div>
          <button
            className="evidence-modal-close-btn"
            type="button"
            aria-label="Close dossier and return to queue (Esc)"
            onClick={onClose}
          >
            <span>Return to Queue</span>
            <kbd>Esc</kbd>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      {/* Workbench Forensic Banner Header */}
      <header className="evidence-hero">
        <div className="evidence-hero__left">
          <div className="evidence-hero__meta-strip">
            <span className="flag-tag">FLAG {evidence.flag.id}</span>
            <span className="flag-detector-tag">
              {detectorLabel(evidence.flag.detector)}
            </span>
            <span className="review-status-pill" data-status={reviewStatus}>
              {reviewStatusLabels[reviewStatus]}
            </span>
            {isLoading ? (
              <span className="evidence-syncing">
                <LoaderCircle className="spin" aria-hidden="true" size={13} strokeWidth={2} />
                Syncing evidence
              </span>
            ) : null}
          </div>

          <h2 className="evidence-hero__title">
            Evidence Investigation & Forensic Dossier
          </h2>
          <p className="evidence-hero__summary">
            {evidence.flag.summary}
          </p>
        </div>

        <div className="evidence-hero__right">
          <div className="priority-card">
            <span className="priority-card__label">Audit Review Priority</span>
            <RiskBadge
              tier={evidence.risk.tier}
              score={evidence.risk.total_score}
            />
            <span className="priority-card__hint">
              Points prioritize review queue order
            </span>
          </div>
        </div>
      </header>

      {/* Decision Workflow Bar (Step 04 Quick Action Bar anchored at top of investigation) */}
      <div className="decision-bar" role="region" aria-label="Reviewer decision toolbar">
        <div className="decision-bar__info">
          <span className="decision-bar__step-badge">STEP 04 · HUMAN DECISION</span>
          <p className="decision-bar__prompt">
            Inspect the evidence below, then record your official review determination:
          </p>
        </div>

        <div className="decision-bar__actions">
          <button
            className="button button--decision-clear"
            type="button"
            data-state={
              actionPending ? "loading" : reviewStatus === "reviewed" ? "success" : undefined
            }
            aria-busy={actionPending}
            disabled={actionPending || reviewStatus === "reviewed"}
            onClick={() => onDecision("reviewed")}
          >
            <CheckCircle2 aria-hidden="true" size={16} strokeWidth={2} />
            {actionPending
              ? "Recording decision…"
              : reviewStatus === "reviewed"
                ? "Reviewed & Cleared"
                : "Mark Reviewed & Cleared"}
          </button>

          <button
            className="button button--decision-dispute"
            type="button"
            data-state={
              actionPending ? "loading" : reviewStatus === "disputed" ? "error" : undefined
            }
            aria-busy={actionPending}
            disabled={actionPending || reviewStatus === "disputed"}
            onClick={() => onDecision("disputed")}
          >
            <MessageSquareWarning aria-hidden="true" size={16} strokeWidth={2} />
            {actionPending
              ? "Recording dispute…"
              : reviewStatus === "disputed"
                ? "Flag Disputed"
                : "Dispute Flag / Request Field Audit"}
          </button>
        </div>

        <div className="decision-bar__status-line" aria-live="polite">
          <span className="status-dot" data-status={reviewStatus} />
          <span>{statusMessage}</span>
        </div>
      </div>

      {/* Core Investigation Workspace Flow */}
      <div className="evidence-sections">
        {/* ============================================================
            SECTION 01: RECORD COMPARISON
           ============================================================ */}
        <section className="evidence-section" aria-labelledby="section-01-heading">
          <div className="evidence-section__header">
            <div className="section-number">01</div>
            <div>
              <h3 id="section-01-heading">Record Comparison & Side-by-Side Verification</h3>
              <p>
                Evaluate identical or overlapping parameters between the primary suspicious work
                and historical/co-located records in the MPLADS registry.
              </p>
            </div>
            {costDelta ? (
              <div className="comparison-delta-badge" title={`Cost difference: ${currencyFormatter.format(costDelta.diff)}`}>
                <TrendingUp size={14} strokeWidth={2} />
                <span>Sanction Delta: {costDelta.label}</span>
              </div>
            ) : null}
          </div>

          <div className="comparison-grid">
            <WorkRecord
              work={evidence.primary_work}
              label="Primary Scoped Record"
              badgeType="primary"
              isComparison={false}
            />

            {comparedWork ? (
              <WorkRecord
                work={comparedWork}
                label="Comparison / Historical Record"
                badgeType="comparison"
                isComparison={true}
              />
            ) : (
              <div className="comparison-unpaired">
                <FileText aria-hidden="true" size={28} strokeWidth={1.6} />
                <h4>No paired duplicate work record</h4>
                <p>
                  This flag was generated based on single-record parameter anomalies (e.g. stalled progress,
                  unit cost variance against district baseline, or missing progress logs).
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ============================================================
            SECTION 02: RISK DECOMPOSITION
           ============================================================ */}
        <section className="evidence-section" aria-labelledby="section-02-heading">
          <div className="evidence-section__header">
            <div className="section-number">02</div>
            <div>
              <h3 id="section-02-heading">Explainable Multi-Factor Risk Decomposition</h3>
              <p>
                Transparent attribution of risk points. The formula is additive and deterministic —
                no black-box AI confidence models.
              </p>
            </div>
            <div className="equation-badge">
              <Scale size={14} strokeWidth={2} />
              <span>{componentPoints} Total Score Points</span>
            </div>
          </div>

          <div className="explainability-callout">
            <HelpCircle size={15} strokeWidth={2} />
            <span>
              <strong>Guiding Rule:</strong> Risk scores prioritize review order in the national queue.
              A high score does not accuse a work of irregularity; it directs human audit attention.
            </span>
          </div>

          {evidence.risk.components && evidence.risk.components.length > 0 ? (
            <div className="risk-components-table">
              <div className="risk-table-header">
                <span>Detector Component</span>
                <span>Explanation & Rationale</span>
                <span>Contributing Flags</span>
                <span>Score Impact</span>
              </div>

              {evidence.risk.components.map((component, idx) => {
                const pct = Math.round((component.points / component.maximum_points) * 100);
                return (
                  <div key={`${component.detector}-${idx}`} className="risk-table-row">
                    <div className="risk-table-col risk-table-col--detector">
                      <strong>{detectorLabel(component.detector)}</strong>
                      <div className="mini-progress-track">
                        <div className="mini-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <div className="risk-table-col risk-table-col--desc">
                      <p>{component.explanation}</p>
                    </div>

                    <div className="risk-table-col risk-table-col--flags">
                      {component.flag_ids.length > 0 ? (
                        <div className="flag-chips">
                          {component.flag_ids.map((fid) => (
                            <code
                              key={fid}
                              className={`flag-chip ${fid === evidence.flag.id ? "flag-chip--active" : ""}`}
                            >
                              {fid} {fid === evidence.flag.id ? "· current" : ""}
                            </code>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">No flag ID</span>
                      )}
                    </div>

                    <div className="risk-table-col risk-table-col--points">
                      <span className="points-display">
                        <strong>+{component.points}</strong>
                        <span>/ {component.maximum_points}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="section-empty-state">
              <Scale size={20} strokeWidth={1.6} />
              <p>No risk breakdown components returned for this work.</p>
            </div>
          )}

          {evidence.risk.explanation ? (
            <div className="risk-summary-note">
              <strong>Audit Synthesis:</strong> {evidence.risk.explanation}
            </div>
          ) : null}
        </section>

        {/* ============================================================
            SECTION 03: SUPPORTING EVIDENCE
           ============================================================ */}
        <section className="evidence-section" aria-labelledby="section-03-heading">
          <div className="evidence-section__header">
            <div className="section-number">03</div>
            <div>
              <h3 id="section-03-heading">Supporting Anomaly Signals & Forensic Assets</h3>
              <p>
                Specific detector evidence payloads including cross-lingual semantic matching,
                unit-cost baseline comparisons, and photo metadata forensics.
              </p>
            </div>
          </div>

          <div className="supporting-evidence-grid">
            {/* Left: Signal Breakdown */}
            <div className="evidence-subpanel">
              <div className="subpanel-header">
                <AlertOctagon size={16} strokeWidth={2} />
                <h4>Triggered Signal Attributes</h4>
              </div>

              {evidence.signals && evidence.signals.length > 0 ? (
                <div className="signal-cards-list">
                  {evidence.signals.map((signal, sIdx) => (
                    <div key={`${signal.label}-${sIdx}`} className="signal-card">
                      <div className="signal-card__top">
                        <span className="signal-card__label">{signal.label}</span>
                        <span className="signal-card__badge">+{signal.points} pts</span>
                      </div>
                      <div className="signal-card__value">
                        <code>{signal.value}</code>
                      </div>
                      <p className="signal-card__explanation">{signal.explanation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="section-empty-state">
                  <p>No specific signal attributes returned for this flag.</p>
                </div>
              )}
            </div>

            {/* Right: Multilingual Matching */}
            <div className="evidence-subpanel">
              <div className="subpanel-header">
                <Languages size={16} strokeWidth={2} />
                <h4>Multilingual Semantic Text Analysis</h4>
              </div>

              {evidence.text_matches && evidence.text_matches.length > 0 ? (
                <div className="text-matches-list">
                  {evidence.text_matches.map((match, mIdx) => (
                    <TextMatchBlock key={`${match.language_pair}-${mIdx}`} match={match} />
                  ))}
                </div>
              ) : (
                <div className="section-empty-state">
                  <Languages size={22} strokeWidth={1.5} />
                  <p>No cross-lingual text matching was triggered for this single-record anomaly.</p>
                </div>
              )}
            </div>
          </div>

          {/* Photo Forensics Block */}
          <div className="photo-forensics-block">
            <div className="photo-forensics-block__header">
              <div className="photo-forensics-block__title">
                <Image size={16} strokeWidth={2} />
                <h4>Site Photo Forensics & Asset Verification</h4>
              </div>
              <div className="photo-forensics-block__status" data-status={evidence.photo_evidence.status}>
                {evidence.photo_evidence.status === "flagged" ? (
                  <MessageSquareWarning size={14} strokeWidth={2} />
                ) : (
                  <CheckCircle2 size={14} strokeWidth={2} />
                )}
                <span>{photoStatusLabel}</span>
              </div>
            </div>

            <p className="photo-forensics-block__summary">
              {evidence.photo_evidence.summary}
            </p>

            {evidence.photo_evidence.primary_reference ? (
              <div className="photo-references-strip">
                <span className="ref-label">Asset Hashes / Identifiers:</span>
                <code>{evidence.photo_evidence.primary_reference}</code>
                {evidence.photo_evidence.related_reference ? (
                  <>
                    <span className="ref-sep">↔</span>
                    <code>{evidence.photo_evidence.related_reference}</code>
                  </>
                ) : null}
              </div>
            ) : null}

            {hasPhotoAssets ? (
              <div className="photo-comparison-grid">
                <div className="photo-asset-card">
                  <div className="photo-asset-card__label">
                    <span>Primary Work Asset</span>
                    <code className="photo-asset-card__work-id">{evidence.primary_work.id}</code>
                  </div>
                  {evidence.photo_evidence.primary_url ? (
                    <div className="photo-asset-card__img-wrap">
                      <img
                        src={evidence.photo_evidence.primary_url}
                        alt={`Site verification asset for work ${evidence.primary_work.id}`}
                        loading="lazy"
                      />
                      <div className="photo-watermark">
                        <span>MPLADS AUDIT EVIDENCE</span>
                      </div>
                    </div>
                  ) : (
                    <div className="photo-missing-placeholder">No primary image file attached</div>
                  )}
                  <div className="photo-asset-card__caption">
                    <span>Source: {provenanceLabels[evidence.primary_work.source]}</span>
                  </div>
                </div>

                <div className="photo-asset-card">
                  <div className="photo-asset-card__label">
                    <span>Comparison Work Asset</span>
                    <code className="photo-asset-card__work-id">
                      {evidence.related_work?.id ?? "Historical match"}
                    </code>
                  </div>
                  {evidence.photo_evidence.related_url ? (
                    <div className="photo-asset-card__img-wrap">
                      <img
                        src={evidence.photo_evidence.related_url}
                        alt={`Comparison site asset for work ${evidence.related_work?.id ?? "comparison"}`}
                        loading="lazy"
                      />
                      <div className="photo-watermark">
                        <span>MPLADS AUDIT EVIDENCE</span>
                      </div>
                    </div>
                  ) : (
                    <div className="photo-missing-placeholder">No comparison image file attached</div>
                  )}
                  <div className="photo-asset-card__caption">
                    <span>
                      Source: {evidence.related_work ? provenanceLabels[evidence.related_work.source] : "Registry database"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="photo-simulated-note">
                <Clock3 size={15} strokeWidth={2} />
                <span>
                  <strong>Asset Status:</strong> Simulated image metadata inspected. No binary photographs were uploaded for this work.
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Institutional Audit Flow Philosophy Footer & Bottom Return Action */}
      <footer className="evidence-footer-philosophy">
        <div className="philosophy-steps">
          <div className="philosophy-step">
            <span className="step-tag">01</span>
            <strong>Automated Detection</strong>
            <span>Explainable algorithms evaluate records</span>
          </div>
          <div className="philosophy-arrow">→</div>
          <div className="philosophy-step">
            <span className="step-tag">02</span>
            <strong>Evidence Assembly</strong>
            <span>Multi-factor signals compiled</span>
          </div>
          <div className="philosophy-arrow">→</div>
          <div className="philosophy-step">
            <span className="step-tag">03</span>
            <strong>Explainable Scoring</strong>
            <span>Prioritizes review workload</span>
          </div>
          <div className="philosophy-arrow">→</div>
          <div className="philosophy-step philosophy-step--highlight">
            <span className="step-tag">04</span>
            <strong>Human Decision</strong>
            <span>Competent authority determines action</span>
          </div>
        </div>

        {onClose ? (
          <div className="evidence-bottom-return">
            <button
              className="button button--return-queue"
              type="button"
              onClick={onClose}
            >
              <ArrowLeft size={15} strokeWidth={2} />
              <span>Return to Audit-Priority Review Queue</span>
            </button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
