import { AlertOctagon, AlertTriangle, CircleCheck } from "lucide-react";
import type { RiskTier } from "../types";

interface RiskBadgeProps {
  tier: RiskTier;
  score?: number;
}

const labels: Record<RiskTier, string> = {
  red: "Red · 70+",
  amber: "Amber · 40–69",
  green: "Green · 0–39",
};

export function RiskBadge({ tier, score }: RiskBadgeProps) {
  const Icon = tier === "red" ? AlertOctagon : tier === "amber" ? AlertTriangle : CircleCheck;

  return (
    <span className="risk-badge" data-tier={tier}>
      <Icon aria-hidden="true" size={14} strokeWidth={2} />
      <span>{labels[tier]}</span>
      {typeof score === "number" ? <strong>{score}</strong> : null}
    </span>
  );
}
