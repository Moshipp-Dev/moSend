"use client";

import { api } from "~/trpc/react";
import { formatMoney, formatNumber } from "~/lib/format";
import {
  AdminPage,
  Cell,
  DataTable,
  Row,
  StatGrid,
  StatTile,
} from "~/components/admin/kit";
import Spinner from "@usesend/ui/src/spinner";

const PLAN_COLUMNS = [
  { label: "Plan" },
  { label: "Teams", className: "text-right" },
  { label: "Precio mensual", className: "text-right" },
  { label: "Ingreso proyectado", className: "text-right" },
];

export default function AdminMetricsPage() {
  const { data, isLoading } = api.adminMetrics.dashboard.useQuery();

  if (isLoading) return <Spinner />;
  if (!data) return <p className="text-sm text-muted-foreground">No hay datos disponibles.</p>;

  const sent = data.emailsThisMonth.sent;
  const rate = (n: number) => (sent > 0 ? `${((n / sent) * 100).toFixed(1)}% de los enviados` : undefined);

  return (
    <AdminPage
      title="Métricas"
      description="Estado global de la plataforma. El MRR cuenta los planes asignados a teams; los planes por cliente se ven en Facturas."
    >
      <StatGrid>
        <StatTile label="Teams totales" value={formatNumber(data.totalTeams)} />
        <StatTile label="Teams activos" value={formatNumber(data.activeTeams)} tone="success" />
        <StatTile
          label="Teams bloqueados"
          value={formatNumber(data.blockedTeams)}
          tone={data.blockedTeams > 0 ? "danger" : "neutral"}
        />
        <StatTile label="MRR estimado" value={formatMoney(data.revenueMonthly, "USD")} />
      </StatGrid>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Correos este mes</h3>
        <StatGrid>
          <StatTile label="Enviados" value={formatNumber(sent)} />
          <StatTile
            label="Entregados"
            value={formatNumber(data.emailsThisMonth.delivered)}
            hint={rate(data.emailsThisMonth.delivered)}
            tone="success"
          />
          <StatTile
            label="Rebotes"
            value={formatNumber(data.emailsThisMonth.bounced)}
            hint={rate(data.emailsThisMonth.bounced)}
            tone={data.emailsThisMonth.bounced > 0 ? "warning" : "neutral"}
          />
          <StatTile
            label="Quejas"
            value={formatNumber(data.emailsThisMonth.complained)}
            hint={rate(data.emailsThisMonth.complained)}
            tone={data.emailsThisMonth.complained > 0 ? "danger" : "neutral"}
          />
        </StatGrid>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Teams por plan</h3>
        <DataTable columns={PLAN_COLUMNS} isEmpty={data.teamsPerPlan.length === 0}>
          {data.teamsPerPlan.map((row) => (
            <Row key={row.planId}>
              <Cell className="font-medium">{row.name}</Cell>
              <Cell numeric>{formatNumber(row.count)}</Cell>
              <Cell numeric className={row.priceMonthly === 0 ? "text-muted-foreground" : ""}>
                {row.priceMonthly === 0 ? "Gratis" : formatMoney(row.priceMonthly, row.currency)}
              </Cell>
              <Cell numeric className="font-medium">
                {formatMoney(row.revenue, row.currency)}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </section>
    </AdminPage>
  );
}
