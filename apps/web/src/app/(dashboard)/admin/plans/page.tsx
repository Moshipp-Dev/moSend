"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { api } from "~/trpc/react";

export default function AdminPlansPage() {
  const utils = api.useUtils();
  const { data: plans, isLoading } = api.adminPlans.list.useQuery();
  const deleteMutation = api.adminPlans.delete.useMutation({
    onSuccess: () => utils.adminPlans.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Planes</h2>
        <Link href="/admin/plans/new">
          <Button>Nuevo plan</Button>
        </Link>
      </div>

      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="py-2">#</th>
            <th className="py-2">Clave</th>
            <th className="py-2">Nombre</th>
            <th className="py-2">Precio/mes</th>
            <th className="py-2">Emails/mes</th>
            <th className="py-2">Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {plans?.map((plan) => (
            <tr key={plan.id} className="border-t">
              <td className="py-2">{plan.sortOrder}</td>
              <td className="py-2 font-mono text-xs">{plan.key}</td>
              <td className="py-2 font-medium">
                {plan.name}
                {plan.isPopular && (
                  <span className="ml-2 text-xs text-primary">Popular</span>
                )}
                {plan.isEnterprise && (
                  <span className="ml-2 text-xs text-muted-foreground">Enterprise</span>
                )}
              </td>
              <td className="py-2">
                {plan.currency} ${Number(plan.priceMonthly).toFixed(2)}
              </td>
              <td className="py-2">
                {plan.emailsPerMonth === -1 ? "∞" : plan.emailsPerMonth.toLocaleString()}
              </td>
              <td className="py-2">
                {plan.isActive ? (
                  <span className="text-green-600">Activo</span>
                ) : (
                  <span className="text-muted-foreground">Inactivo</span>
                )}
              </td>
              <td className="py-2 text-right">
                <Link
                  href={`/admin/plans/${plan.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  Editar
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar plan "${plan.name}"?`)) {
                      deleteMutation.mutate({ id: plan.id });
                    }
                  }}
                  className="ml-4 text-sm text-destructive hover:underline"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
