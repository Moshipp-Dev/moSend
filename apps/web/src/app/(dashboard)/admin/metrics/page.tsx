"use client";

import { api } from "~/trpc/react";
import Spinner from "@usesend/ui/src/spinner";

export default function AdminMetricsPage() {
  const { data, isLoading } = api.adminMetrics.dashboard.useQuery();

  if (isLoading) return <Spinner />;
  if (!data) return <p>No hay datos disponibles.</p>;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Métricas globales</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="Teams totales" value={data.totalTeams} />
        <MetricCard label="Teams activos" value={data.activeTeams} />
        <MetricCard label="Teams bloqueados" value={data.blockedTeams} />
        <MetricCard
          label="MRR estimado"
          value={`$${data.revenueMonthly.toFixed(2)}`}
        />
      </div>

      <section>
        <h3 className="mb-3 text-lg font-semibold">Teams por plan</h3>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-2">Plan</th>
              <th className="py-2">Teams</th>
              <th className="py-2">Precio mensual</th>
              <th className="py-2">Ingreso proyectado</th>
            </tr>
          </thead>
          <tbody>
            {data.teamsPerPlan.map((row) => (
              <tr key={row.planId} className="border-t">
                <td className="py-2 font-medium">{row.name}</td>
                <td className="py-2">{row.count}</td>
                <td className="py-2">
                  {row.priceMonthly === 0
                    ? "—"
                    : `${row.currency} $${row.priceMonthly.toFixed(2)}`}
                </td>
                <td className="py-2">
                  ${row.revenue.toFixed(2)} {row.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold">Emails este mes</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard label="Enviados" value={data.emailsThisMonth.sent} />
          <MetricCard label="Entregados" value={data.emailsThisMonth.delivered} />
          <MetricCard label="Rebotes" value={data.emailsThisMonth.bounced} />
          <MetricCard label="Quejas" value={data.emailsThisMonth.complained} />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
