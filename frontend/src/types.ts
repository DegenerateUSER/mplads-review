export type RoleMode = "ministry" | "state" | "district" | "mp";
export type RiskTier = "red" | "amber" | "green";
export type ReviewStatus =
  | "pending"
  | "reviewed"
  | "disputed"
  | "dismissed"
  | "needs_follow_up";
export type DataSource = "real_scraped" | "manually_compiled" | "synthetic";

export interface Work {
  id: string;
  title: string;
  description: string;
  state: string;
  district: string;
  constituency: string;
  mp_name: string;
  category: string;
  sanction_amount: number;
  expenditure: number;
  quantity?: number;
  unit?: string;
  unit_cost?: number;
  status: string;
  sanctioned_date: string;
  last_progress_date: string;
  progress_percent: number;
  source: DataSource;
  lat: number;
  lon: number;
  risk_score: number;
  risk_tier: RiskTier;
}

export interface Flag {
  id: string;
  work_id: string;
  detector: string;
  severity: RiskTier;
  points: number;
  summary: string;
  related_work_id: string | null;
  evidence: Record<string, unknown>;
  review_status: ReviewStatus;
}

export interface DashboardTotals {
  works: number;
  flags: number;
  flagged_works: number;
  high_risk: number;
  pending_review: number;
  sanction_amount: number;
}

export interface DistrictSummary {
  state: string;
  district: string;
  total_works: number;
  flagged_works: number;
  pending_review: number;
  average_risk: number;
  max_risk: number;
  risk_tier: RiskTier;
}

export interface AuditQueueItem {
  flag: Flag;
  work: Work;
}

export interface DashboardSummary {
  totals: DashboardTotals;
  detector_counts: Record<string, number>;
  provenance_counts: Record<string, number>;
  by_district: DistrictSummary[];
  audit_queue: AuditQueueItem[];
}

export interface RiskSignal {
  label: string;
  value: string;
  points: number;
  explanation: string;
}

export interface TextMatch {
  language_pair: string;
  score: number;
  score_label: string;
  primary_text: string;
  related_text: string;
  primary_match: string;
  related_match: string;
  canonical_terms: string[];
  method_note: string;
}

export interface PhotoEvidence {
  status: "flagged" | "not_flagged" | "not_available";
  summary: string;
  primary_reference: string | null;
  related_reference: string | null;
  primary_url: string | null;
  related_url: string | null;
  details: Record<string, unknown>;
}

export interface RiskComponent {
  detector: string;
  points: number;
  maximum_points: number;
  flag_ids: string[];
  explanation: string;
}

export interface RiskScore {
  work_id: string;
  total_score: number;
  tier: RiskTier;
  components: RiskComponent[];
  explanation: string;
}

export interface EvidenceResponse {
  flag: Flag;
  primary_work: Work;
  related_work: Work | null;
  risk: RiskScore;
  signals: RiskSignal[];
  text_matches: TextMatch[];
  photo_evidence: PhotoEvidence;
}

export interface ApiResult<T> {
  data: T;
  mode: "api" | "demo";
  message: string;
}
