"use client";

import { PlanForm } from "~/components/admin/PlanForm";

export default function NewPlanPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-xl font-semibold">Nuevo plan</h2>
      <PlanForm mode="create" />
    </div>
  );
}
