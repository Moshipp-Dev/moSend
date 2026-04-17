"use client";

import { Progress } from "@usesend/ui/src/progress";

interface UsageBarProps {
  label: string;
  current: number;
  limit: number;
}

export function UsageBar({ label, current, limit }: UsageBarProps) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited
    ? 0
    : limit === 0
      ? 100
      : Math.min(100, Math.round((current / limit) * 100));
  const color =
    pct >= 100
      ? "bg-destructive"
      : pct >= 80
        ? "bg-yellow-500"
        : "bg-primary";

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-xs">
          {current.toLocaleString()} / {isUnlimited ? "∞" : limit.toLocaleString()}
        </span>
      </div>
      {!isUnlimited && (
        <Progress value={pct} className={`h-2 ${color}`} />
      )}
    </div>
  );
}
