"use client";

import Link from "next/link";
import { api } from "~/trpc/react";

export function UsageNearLimitBanner() {
  const { data: plan } = api.billing.getCurrentPlan.useQuery();
  const { data: usage } = api.billing.getThisMonthUsage.useQuery();

  if (!plan || !usage) return null;

  const monthlySent = usage.month.reduce((acc, c) => acc + c.sent, 0);

  const emailLimit = plan.emailsPerMonth;
  if (emailLimit === -1) return null;

  const pct = emailLimit > 0 ? (monthlySent / emailLimit) * 100 : 0;
  if (pct < 80) return null;

  const overLimit = pct >= 100;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${
        overLimit
          ? "bg-destructive text-destructive-foreground"
          : "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100"
      }`}
    >
      <span>
        {overLimit
          ? `Superaste el límite de correos/mes del plan ${plan.name}. Los envíos pueden estar bloqueados.`
          : `Llevas ${Math.round(pct)}% de tu cuota de correos mensuales (${plan.name}).`}
      </span>
      <Link
        href="/pricing"
        className="rounded bg-background/80 px-3 py-1 text-xs font-medium hover:bg-background"
      >
        Ver planes
      </Link>
    </div>
  );
}
