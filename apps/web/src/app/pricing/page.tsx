"use client";

import Spinner from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";
import { PricingGrid } from "~/components/pricing/PricingGrid";

export default function PricingPage() {
  const { data: plans, isLoading } = api.plan.getPublicList.useQuery();

  return (
    <div className="space-y-8">
      <header className="text-center space-y-2">
        <h1 className="text-4xl font-bold">Planes y precios</h1>
        <p className="text-muted-foreground">
          Elige el plan que se ajuste a tu volumen de envíos. Puedes cambiar de
          plan en cualquier momento.
        </p>
      </header>

      {isLoading ? <Spinner /> : <PricingGrid plans={plans ?? []} />}
    </div>
  );
}
