"use client";

import type { PricingPlan } from "@prisma/client";
import { Button } from "@usesend/ui/src/button";
import { toast } from "@usesend/ui/src/toaster";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

interface PlanCardProps {
  plan: PricingPlan;
  isCurrent?: boolean;
}

export function PlanCard({ plan, isCurrent }: PlanCardProps) {
  const session = useSession();
  const router = useRouter();
  const requestActivation = api.planActivation.request.useMutation({
    onSuccess: (request) => {
      router.push(`/billing/activation-pending/${request.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const perks = (plan.perks as string[] | null) ?? [];
  const price = Number(plan.priceMonthly);

  const onSubscribe = () => {
    if (session.status !== "authenticated") {
      router.push(`/login?redirectTo=${encodeURIComponent("/pricing")}`);
      return;
    }
    requestActivation.mutate({ planId: plan.id });
  };

  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        plan.isPopular ? "border-primary shadow-lg" : ""
      }`}
    >
      {plan.isPopular && (
        <span className="mb-3 w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Popular
        </span>
      )}
      <h3 className="text-2xl font-bold">{plan.name}</h3>
      {plan.description && (
        <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
      )}

      <div className="mt-4">
        <span className="text-4xl font-bold">
          {price === 0 ? "Gratis" : `$${price.toFixed(0)}`}
        </span>
        {price > 0 && (
          <span className="text-muted-foreground"> / mes {plan.currency}</span>
        )}
      </div>

      <ul className="mt-6 flex-1 space-y-2 text-sm">
        <li>
          <strong>{formatLimit(plan.emailsPerMonth)}</strong> correos / mes
        </li>
        <li>
          <strong>{formatLimit(plan.maxDomains)}</strong> dominios
        </li>
        <li>
          <strong>{formatLimit(plan.maxContactBooks)}</strong> libretas de contactos
        </li>
        <li>
          <strong>{formatLimit(plan.maxTeamMembers)}</strong> miembros del equipo
        </li>
        {perks.map((perk, i) => (
          <li key={i}>{perk}</li>
        ))}
      </ul>

      <Button
        onClick={onSubscribe}
        disabled={isCurrent || requestActivation.isPending}
        className="mt-6"
        variant={plan.isPopular ? "default" : "outline"}
      >
        {isCurrent
          ? "Plan actual"
          : price === 0
            ? "Comenzar"
            : requestActivation.isPending
              ? "Enviando solicitud..."
              : "Solicitar activación"}
      </Button>
    </div>
  );
}

function formatLimit(limit: number): string {
  if (limit === -1) return "Ilimitados";
  return limit.toLocaleString();
}
