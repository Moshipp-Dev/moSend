"use client";

import type { PricingPlan } from "@prisma/client";

export function PlanBadge({ plan }: { plan: PricingPlan | null | undefined }) {
  if (!plan) {
    return (
      <span className="rounded bg-muted px-2 py-1 text-xs">Sin plan</span>
    );
  }
  return (
    <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
      {plan.name}
    </span>
  );
}
