"use client";

import { Card } from "@usesend/ui/src/card";
import Spinner from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";
import { useTeam } from "~/providers/team-context";
import { UsageBar } from "./UsageBar";
import { PlanBadge } from "./PlanBadge";

export function UsagePanel() {
  const { currentIsClient } = useTeam();
  const enabled = !currentIsClient;
  const { data: plan, isLoading: planLoading } =
    api.billing.getCurrentPlan.useQuery(undefined, { enabled });
  const { data: usage, isLoading: usageLoading } =
    api.billing.getThisMonthUsage.useQuery(undefined, { enabled });

  if (!enabled) return null;

  if (planLoading || usageLoading) {
    return (
      <Card className="p-6">
        <Spinner />
      </Card>
    );
  }

  const monthlySent = usage?.month.reduce((acc, c) => acc + c.sent, 0) ?? 0;
  const dailySent = usage?.day.reduce((acc, c) => acc + c.sent, 0) ?? 0;

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Uso de este mes</h3>
        <PlanBadge plan={plan} />
      </div>

      <UsageBar
        label="Correos enviados (mes)"
        current={monthlySent}
        limit={plan?.emailsPerMonth ?? -1}
      />
      <UsageBar
        label="Correos enviados (hoy)"
        current={dailySent}
        limit={plan?.emailsPerDay ?? -1}
      />
    </Card>
  );
}
