"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@usesend/ui/src/button";
import { toast } from "@usesend/ui/src/toaster";
import { api } from "~/trpc/react";
import { formatMoney, formatNumber } from "~/lib/format";
import {
  AdminPage,
  Cell,
  CellStack,
  ConfirmDialog,
  DataTable,
  Pill,
  Row,
  RowActions,
} from "~/components/admin/kit";

const COLUMNS = [
  { label: "Plan" },
  { label: "Precio / mes", className: "text-right" },
  { label: "Correos / mes", className: "text-right" },
  { label: "Correos / día", className: "text-right" },
  { label: "Estado" },
  { label: "Acciones", className: "text-right" },
];

function limit(value: number) {
  return value === -1 ? "Ilimitado" : formatNumber(value);
}

export default function AdminPlansPage() {
  const utils = api.useUtils();
  const { data: plans, isLoading } = api.adminPlans.list.useQuery();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const deleteMutation = api.adminPlans.delete.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.mode === "deleted"
          ? "Plan eliminado"
          : "Plan retirado del catálogo: ya tenía clientes, activaciones o facturas asociadas, así que se conserva como inactivo",
      );
      await utils.adminPlans.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const unpriced = plans?.filter((p) => p.isActive && Number(p.priceMonthly) === 0 && p.key !== "free").length ?? 0;

  return (
    <AdminPage
      title="Planes"
      description="Catálogo que ven los clientes en /pricing. Cada plan es un paquete mensual: precio, cuota de correos y límites. -1 significa ilimitado."
      actions={
        <Link href="/admin/plans/new">
          <Button>Nuevo plan</Button>
        </Link>
      }
    >
      {unpriced > 0 ? (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
          {unpriced} plan{unpriced === 1 ? "" : "es"} activo{unpriced === 1 ? "" : "s"} sin precio. Se muestran como gratis y no generan cuentas de cobro; cargá el precio antes de venderlos.
        </div>
      ) : null}

      <DataTable
        columns={COLUMNS}
        isLoading={isLoading}
        isEmpty={plans?.length === 0}
        emptyMessage="Todavía no hay planes."
      >
        {plans?.map((plan) => (
          <Row key={plan.id}>
            <Cell>
              <div className="flex items-center gap-2">
                <CellStack
                  primary={plan.name}
                  secondary={<span className="font-mono">{plan.key}</span>}
                />
                {plan.isPopular ? <Pill tone="info">Popular</Pill> : null}
                {plan.isEnterprise ? <Pill>Enterprise</Pill> : null}
              </div>
            </Cell>
            <Cell numeric className={Number(plan.priceMonthly) === 0 ? "text-muted-foreground" : "font-medium"}>
              {Number(plan.priceMonthly) === 0 ? "Gratis" : formatMoney(Number(plan.priceMonthly), plan.currency)}
            </Cell>
            <Cell numeric>{limit(plan.emailsPerMonth)}</Cell>
            <Cell numeric>{limit(plan.emailsPerDay)}</Cell>
            <Cell>
              {plan.isActive ? <Pill tone="success">Activo</Pill> : <Pill>Inactivo</Pill>}
            </Cell>
            <Cell>
              <RowActions>
                <Link href={`/admin/plans/${plan.id}`}>
                  <Button size="sm" variant="outline">
                    Editar
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget({ id: plan.id, name: plan.name })}
                >
                  Eliminar
                </Button>
              </RowActions>
            </Cell>
          </Row>
        ))}
      </DataTable>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Eliminar el plan ${deleteTarget?.name ?? ""}`}
        description="Si el plan ya se usó (clientes, activaciones o facturas), se retira del catálogo y queda inactivo para conservar el historial; si nunca se usó, se borra definitivamente."
        confirmLabel="Eliminar"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
      />
    </AdminPage>
  );
}
