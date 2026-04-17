"use client";

import type { PricingPlan } from "@prisma/client";

export function ContactSalesCard({ plan }: { plan: PricingPlan }) {
  const perks = (plan.perks as string[] | null) ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-8 md:flex-row md:items-center md:justify-between">
      <div>
        <h3 className="text-2xl font-bold">{plan.name}</h3>
        {plan.description && (
          <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
        )}
        {perks.length > 0 && (
          <ul className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {perks.map((p, i) => (
              <li key={i}>• {p}</li>
            ))}
          </ul>
        )}
      </div>

      <a
        href="mailto:ventas@mosend.dev?subject=Interés%20en%20plan%20Constelación"
        className="inline-flex items-center justify-center whitespace-nowrap rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Contáctanos
      </a>
    </div>
  );
}
