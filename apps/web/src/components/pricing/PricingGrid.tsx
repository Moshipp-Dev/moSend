"use client";

import type { PricingPlan } from "@prisma/client";
import { PlanCard } from "./PlanCard";
import { ContactSalesCard } from "./ContactSalesCard";

interface PricingGridProps {
  plans: PricingPlan[];
  currentPlanId?: number | null;
}

export function PricingGrid({ plans, currentPlanId }: PricingGridProps) {
  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
  const standard = sorted.filter((p) => !p.isEnterprise);
  const enterprise = sorted.find((p) => p.isEnterprise);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {standard.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.id === currentPlanId}
          />
        ))}
      </div>
      {enterprise && <ContactSalesCard plan={enterprise} />}
    </div>
  );
}
