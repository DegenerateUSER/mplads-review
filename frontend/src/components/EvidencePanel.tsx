import {
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  Image,
  Languages,
  Link2,
  LoaderCircle,
  MapPin,
  MessageSquareWarning,
  Scale,
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
}

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
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
  reviewed: "Reviewed",
  disputed: "Disputed",
  dismissed: "Dismissed",
  needs_follow_up: "Needs follow-up",
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
  if (!value) return "Not supplied";
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
      <mark>{text.slice(index, index + match.length)}</mark>
      {text.slice(index + match.length)}
    </>
  );
}

function WorkRecord({ work, label }: { work: Work; label: string }) {
  return (
    <article className="work-record">
      <div className="work-record__topline">
        <span>{label}</span>
        <span className="provenance-badge">
          <Database aria-hidden="true" size={13} strokeWidth={2} />
          {provenanceLabels[work.source]}
        </span>
      </div>
      <p className="work-record__id">
        <code>{work.id}</code>
      </p>
      <h3>{work.title}</h3>
      <p className="work-record__description">{work.description}</p>
      <dl className="work-record__facts">
        <div>
          <dt>District</dt>
          <dd>
            <MapPin aria-hidden="true" size={14} strokeWidth={1.8} />
            {work.district}, {work.state}
          </dd>
        </div>
        <div>
          <dt>Sanction</dt>
          <dd>{currencyFormatter.format(work.sanction_amount)}</dd>
        </div>
        {typeof work.quantity === "number" ? (
          <div>
            <dt>Quantity</dt>
            <dd>
              {quantityFormatter.format(work.quantity)}
              {work.unit ? ` × ${work.unit}` : ""}
            </dd>
          </div>
        ) : null}
        {typeof work.unit_cost === "number" ? (
          <div>
            <dt>Normalised unit cost</dt>
            <dd>
              {currencyFormatter.format(work.unit_cost)}
              {work.unit ? ` per ${work.unit}` : " per unit"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Sanctioned</dt>
          <dd>{formatDate(work.sanctioned_date)}</dd>
        </div>
        <div>
          <dt>Last progress</dt>
          <dd>{formatDate(work.last_progress_date)}</dd>
        </div>
      </dl>
      <div className="work-record__progress">
        <div>
          <span>Recorded progress</span>
          <strong>{work.progress_percent}%</strong>
        </div>
        <progress
          max={100}
          value={work.progress_percent}
          aria-label={`${work.id} recorded progress ${work.progress_percent}%`}
        />
      </div>
    </article>
  );
}

function TextMatchBlock({ match }: { match: TextMatch }) {
  return (
    <article className="text-match">
      <div className="text-match__header">
        <span>
          <Languages aria-hidden="true" size={16} strokeWidth={1.8} />
          {match.language_pair}
        </span>
        <strong>
          {match.score} / 100 · {match.score_label}
        </strong>
      </div>
      <div className="text-match__pair">
        <p lang="en">{highlightMatch(match.primary_text, match.primary_match)}</p>
        <Link2 aria-hidden="true" size={17} strokeWidth={1.8} />
        <p lang="hi">{highlightMatch(match.related_text, match.related_match)}</p>
      </div>
      {match.canonical_terms.length ? (
        <p className="text-match__terms">
          <strong>Canonical overlap</strong>
          {match.canonical_terms.map((term) => (
            <mark key={term}>{term}</mark>
          ))}
        </p>
      ) : null}
      <p className="text-match__note">{match.method_note}</p>
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
}: EvidencePanelProps) {
  if (!evidence) {
    return (
      <div className="evidence-shell" aria-busy={isLoading}>
        <header className="evidence-header evidence-header--unavailable">
          <div className="evidence-header__copy">
            <div className="evidence-header__meta">
              <span>{selectedFlagId || "No flag selected"}</span>
              {isLoading ? (
                <span className="evidence-loading">
                  <LoaderCircle aria-hidden="true" size={14} strokeWidth={1.8} />
                  Loading exact evidence
                </span>
              ) : null}
            </div>
            <h2>
              {isLoading
                ? "Loading exact evidence"
                : selectedFlagId
                  ? "Exact evidence unavailable"
                  : "No evidence selected"}
            </h2>
            <p>
              {selectedFlagId
                ? `No evidence payload for ${selectedFlagId} is available. No other flag has been substituted, so review actions are disabled.`
                : "This scope has no flag selected. Review actions remain disabled until exact evidence is available."}
            </p>
          </div>
        </header>
        <div className="evidence-actions">
          <button className="button button--light" type="button" disabled>
            <CheckCircle2 aria-hidden="true" size={17} strokeWidth={1.9} />
            Mark reviewed
          </button>
          <button className="button button--ghost-danger" type="button" disabled>
            <MessageSquareWarning aria-hidden="true" size={17} strokeWidth={1.9} />
            Dispute flag
          </button>
          <p className="evidence-actions__status" aria-live="polite">
            {statusMessage}
          </p>
        </div>
        <div className="evidence-unavailable">
          <FileText aria-hidden="true" size={24} strokeWidth={1.6} />
          <strong>Review requires an exact flag match</strong>
          <p>Select another queue row or retry after the evidence service is available.</p>
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
  const hasPhotoAssets = Boolean(
    evidence.photo_evidence.primary_url || evidence.photo_evidence.related_url,
  );
  const photoStatusLabel =
    evidence.photo_evidence.status === "not_available"
      ? "No photo evidence supplied"
      : evidence.photo_evidence.status === "not_flagged"
        ? "No flagged photo-forensics signal"
        : evidence.flag.detector === "photo_quality"
          ? "Photo quality signal needs review"
          : evidence.flag.detector === "photo_reuse"
            ? "Photo reuse signal needs review"
            : "Photo-forensics signal needs review";

  return (
    <div className="evidence-shell" aria-busy={isLoading}>
      <header className="evidence-header">
        <div className="evidence-header__copy">
          <div className="evidence-header__meta">
            <span>{evidence.flag.id}</span>
            <span className="review-status" data-status={reviewStatus}>
              {reviewStatusLabels[reviewStatus]}
            </span>
            {isLoading ? (
              <span className="evidence-loading">
                <LoaderCircle aria-hidden="true" size={14} strokeWidth={1.8} />
                Loading evidence
              </span>
            ) : null}
          </div>
          <h2>Compare the records. Then decide.</h2>
          <p>{evidence.flag.summary}</p>
        </div>
        <div className="evidence-header__risk">
          <span>Overall review priority</span>
          <RiskBadge
            tier={evidence.risk.tier}
            score={evidence.risk.total_score}
          />
        </div>
      </header>

      <div className="evidence-actions">
        <button
          className="button button--light"
          type="button"
          data-state={
            actionPending ? "loading" : reviewStatus === "reviewed" ? "success" : undefined
          }
          aria-busy={actionPending}
          disabled={actionPending || reviewStatus === "reviewed"}
          onClick={() => onDecision("reviewed")}
        >
          <CheckCircle2 aria-hidden="true" size={17} strokeWidth={1.9} />
          {actionPending
            ? "Saving decision"
            : reviewStatus === "reviewed"
              ? "Reviewed"
              : "Mark reviewed"}
        </button>
        <button
          className="button button--ghost-danger"
          type="button"
          data-state={
            actionPending ? "loading" : reviewStatus === "disputed" ? "error" : undefined
          }
          aria-busy={actionPending}
          disabled={actionPending || reviewStatus === "disputed"}
          onClick={() => onDecision("disputed")}
        >
          <MessageSquareWarning aria-hidden="true" size={17} strokeWidth={1.9} />
          {actionPending
            ? "Saving decision"
            : reviewStatus === "disputed"
              ? "Disputed"
              : "Dispute flag"}
        </button>
        <p className="evidence-actions__status" aria-live="polite">
          {statusMessage}
        </p>
      </div>

      <div className="evidence-content" key={evidence.flag.id}>
        <div className="comparison-heading">
          <div>
            <FileText aria-hidden="true" size={17} strokeWidth={1.8} />
            <h3>Record comparison</h3>
          </div>
          <p>
            Both records retain their source label. Similarity is a review signal, not a
            decision.
          </p>
        </div>
        <div className="work-comparison">
          <WorkRecord work={evidence.primary_work} label="Primary work" />
          {comparedWork ? (
            <WorkRecord work={comparedWork} label="Comparison work" />
          ) : (
            <div className="comparison-empty">
              <FileText aria-hidden="true" size={22} strokeWidth={1.6} />
              <strong>No comparison work returned</strong>
              <span>Review the detector signals and source record before deciding.</span>
            </div>
          )}
        </div>

        <section className="risk-decomposition" aria-labelledby="risk-title">
          <div className="analysis-heading">
            <Scale aria-hidden="true" size={17} strokeWidth={1.8} />
            <div>
              <h3 id="risk-title">Overall risk decomposition</h3>
              <p>
                {evidence.risk.components.length
                  ? `${evidence.risk.components
                      .map((component) => component.points)
                      .join(" + ")} = ${componentPoints} component points${
                      componentPoints === evidence.risk.total_score
                        ? ", matching the overall score."
                        : `; the backend overall score is ${evidence.risk.total_score}.`
                    }`
                  : `No scored components returned; overall score ${evidence.risk.total_score}.`}
              </p>
            </div>
          </div>
          {evidence.risk.components.length ? (
            <ol className="risk-component-list">
              {evidence.risk.components.map((component, index) => (
                <li key={`${component.detector}-${index}`}>
                  <span className="risk-component-list__points">
                    {component.points} / {component.maximum_points}
                  </span>
                  <div>
                    <div className="signal-list__title">
                      <strong>{detectorLabel(component.detector)}</strong>
                      <span>
                        {component.flag_ids.length
                          ? `${component.flag_ids.length} contributing ${
                              component.flag_ids.length === 1 ? "flag" : "flags"
                            }`
                          : "No contributing flag IDs"}
                      </span>
                    </div>
                    <p>{component.explanation}</p>
                    {component.flag_ids.length ? (
                      <p className="risk-component-list__flags">
                        {component.flag_ids.map((flagId) => (
                          <code key={flagId}>
                            {flagId}
                            {flagId === evidence.flag.id ? " · selected" : ""}
                          </code>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="analysis-empty">
              <Scale aria-hidden="true" size={20} strokeWidth={1.6} />
              <p>No risk components were returned for this work.</p>
            </div>
          )}
          {evidence.risk.explanation ? (
            <p className="risk-decomposition__note">{evidence.risk.explanation}</p>
          ) : null}
        </section>

        <div className="evidence-analysis">
          <section className="signal-section" aria-labelledby="signal-title">
            <div className="analysis-heading">
              <Scale aria-hidden="true" size={17} strokeWidth={1.8} />
              <div>
                <h3 id="signal-title">Selected flag supporting evidence</h3>
                <p>
                  {evidence.flag.id} contributes {evidence.flag.points} raw detector points.
                  These signals explain that flag, not the work’s full risk equation.
                </p>
              </div>
            </div>
            {evidence.signals.length ? (
              <ol className="signal-list">
                {evidence.signals.map((signal) => (
                  <li key={signal.label}>
                    <span className="signal-list__points">{signal.points} pts</span>
                    <div>
                      <div className="signal-list__title">
                        <strong>{signal.label}</strong>
                        <span>{signal.value}</span>
                      </div>
                      <p>{signal.explanation}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="analysis-empty">
                <Scale aria-hidden="true" size={20} strokeWidth={1.6} />
                <p>No supporting signal details were returned for this selected flag.</p>
              </div>
            )}
          </section>

          <section className="match-section" aria-labelledby="match-title">
            <div className="analysis-heading">
              <Languages aria-hidden="true" size={17} strokeWidth={1.8} />
              <div>
                <h3 id="match-title">Multilingual text evidence</h3>
                <p>Matched phrases remain visible for direct reviewer inspection.</p>
              </div>
            </div>
            {evidence.text_matches.length ? (
              evidence.text_matches.map((match) => (
                <TextMatchBlock key={`${match.language_pair}-${match.score}`} match={match} />
              ))
            ) : (
              <div className="analysis-empty">
                <Languages aria-hidden="true" size={20} strokeWidth={1.6} />
                <p>No multilingual text signal contributes to this selected review.</p>
              </div>
            )}
          </section>
        </div>

        <section className="photo-evidence" aria-labelledby="photo-title">
          <div className="analysis-heading">
            <Image aria-hidden="true" size={17} strokeWidth={1.8} />
            <div>
              <h3 id="photo-title">Photo forensics</h3>
              <p>{evidence.photo_evidence.summary}</p>
            </div>
          </div>
          <div>
            <div className="photo-evidence__status">
              {evidence.photo_evidence.status === "flagged" ? (
                <MessageSquareWarning aria-hidden="true" size={17} strokeWidth={1.8} />
              ) : (
                <Clock3 aria-hidden="true" size={17} strokeWidth={1.8} />
              )}
              <span>{photoStatusLabel}</span>
              {evidence.photo_evidence.primary_reference ? (
                <code>
                  {evidence.photo_evidence.primary_reference} ↔{" "}
                  {evidence.photo_evidence.related_reference ?? "No related reference"}
                </code>
              ) : null}
            </div>
            {hasPhotoAssets ? (
              <div className="photo-evidence__assets">
                {evidence.photo_evidence.primary_url ? (
                  <figure>
                    <img
                      src={evidence.photo_evidence.primary_url}
                      alt={`Supplied evidence image for primary work ${evidence.primary_work.id}`}
                      loading="lazy"
                    />
                    <figcaption>Primary work · supplied image</figcaption>
                  </figure>
                ) : (
                  <div className="photo-evidence__missing">
                    No primary image URL supplied
                  </div>
                )}
                {evidence.photo_evidence.related_url ? (
                  <figure>
                    <img
                      src={evidence.photo_evidence.related_url}
                      alt={`Supplied evidence image for comparison work ${
                        evidence.related_work?.id ?? "not identified"
                      }`}
                      loading="lazy"
                    />
                    <figcaption>Comparison work · supplied image</figcaption>
                  </figure>
                ) : (
                  <div className="photo-evidence__missing">
                    No related image URL supplied
                  </div>
                )}
              </div>
            ) : (
              <p className="photo-evidence__metadata-note">
                <strong>Simulated photo metadata only.</strong> No image assets were supplied,
                so this interface is not presenting a visual comparison.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
