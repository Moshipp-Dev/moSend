"use client";

import Link from "next/link";
import { api } from "~/trpc/react";

export function UsageNearLimitBanner() {
  // The banner now applies to every team role. CLIENTs get their individual
  // plan + filtered usage via the billing router.
  const { data: plan } = api.billing.getCurrentPlan.useQuery();
  const { data: usage } = api.billing.getThisMonthUsage.useQuery();
  const { data: account } = api.billing.getAccountStatus.useQuery();

  if (account?.isBlocked) {
    return (
      <div className="flex items-center justify-between gap-3 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
        <span>
          Tu cuenta está suspendida y los envíos están bloqueados
          {account.reason ? `: ${account.reason}` : ""}. Regularizá tu pago y
          escribinos para reactivarla.
        </span>
        <Link
          href="/settings/billing"
          className="rounded bg-background/80 px-3 py-1 text-xs font-medium text-foreground hover:bg-background"
        >
          Ver mi plan
        </Link>
      </div>
    );
  }

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
