import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { RiskTier } from "../types";

interface RiskBadgeProps {
  tier: RiskTier;
  score?: number;
  compact?: boolean;
}

const labels: Record<RiskTier, string> = {
  red: "High · 70+",
  amber: "Med · 40–69",
  green: "Low · 0–39",
};

export function RiskBadge({ tier, score, compact = false }: RiskBadgeProps) {
  const Icon = tier === "red" ? AlertCircle : tier === "amber" ? AlertTriangle : CheckCircle2;

  return (
    <span className="risk-badge" data-tier={tier} data-compact={compact ? "true" : undefined}>
      <Icon className="risk-badge__icon" aria-hidden="true" size={13} strokeWidth={2.2} />
      <span className="risk-badge__label">{labels[tier]}</span>
      {typeof score === "number" ? <strong className="risk-badge__score">{score}</strong> : null}
    </span>
  );
}
