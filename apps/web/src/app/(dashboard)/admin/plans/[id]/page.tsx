"use client";

import { useParams } from "next/navigation";
import Spinner from "@usesend/ui/src/spinner";
import { PlanForm } from "~/components/admin/PlanForm";
import { api } from "~/trpc/react";

export default function EditPlanPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: plan, isLoading } = api.adminPlans.get.useQuery({ id });

  if (isLoading) return <Spinner />;
  if (!plan) return <p>Plan no encontrado.</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-xl font-semibold">Editar plan: {plan.name}</h2>
      <PlanForm mode="edit" plan={plan} />
    </div>
  );
}
