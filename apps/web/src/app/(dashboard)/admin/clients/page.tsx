"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Textarea } from "@usesend/ui/src/textarea";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { format } from "date-fns";
import { api } from "~/trpc/react";

const DEFAULT_PERIOD_DAYS = "30";

type ClientRow = {
  userId: number;
  name: string | null;
  email: string | null;
  team: { id: number; name: string };
  plan: { id: number; key: string; name: string } | null;
  domainsCount: number;
  isBlocked: boolean;
  blockedReason: string | null;
  activeActivation: {
    id: string;
    expiresAt: Date | string | null;
    reviewedAt: Date | string | null;
    plan: { id: number; name: string };
  } | null;
};

// Operator view of billable customers (CLIENT users). From here the operator
// assigns or renews a plan, and suspends or reactivates a client.
export default function AdminClientsPage() {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "blocked">(
    "all",
  );

  const { data: plans } = api.adminPlans.list.useQuery();
  const { data, isLoading } = api.adminClients.list.useQuery({
    search: search || undefined,
    planId: planFilter === "all" ? undefined : Number(planFilter),
    blocked:
      stateFilter === "all" ? undefined : stateFilter === "blocked",
    page,
    pageSize: 25,
  });

  const invalidateAll = async () => {
    await Promise.all([
      utils.adminClients.list.invalidate(),
      utils.adminActivations.list.invalidate(),
    ]);
  };

  // Assign / renew dialog -----------------------------------------------------
  const [assignTarget, setAssignTarget] = useState<ClientRow | null>(null);
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignPeriodDays, setAssignPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
  const [assignPaymentMethod, setAssignPaymentMethod] = useState("");
  const [assignPaymentReference, setAssignPaymentReference] = useState("");
  const [assignNotes, setAssignNotes] = useState("");

  const openAssign = (client: ClientRow) => {
    setAssignTarget(client);
    setAssignPlanId(client.plan ? String(client.plan.id) : "");
    setAssignPeriodDays(DEFAULT_PERIOD_DAYS);
    setAssignPaymentMethod("");
    setAssignPaymentReference("");
    setAssignNotes("");
  };

  const closeAssign = () => setAssignTarget(null);

  const assignMutation = api.adminActivations.createManual.useMutation({
    onSuccess: async () => {
      toast.success("Plan asignado y cliente notificado");
      await invalidateAll();
      closeAssign();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitAssign = () => {
    if (!assignTarget || !assignPlanId) {
      toast.error("Selecciona un plan");
      return;
    }
    const days = Number(assignPeriodDays.trim());
    assignMutation.mutate({
      teamId: assignTarget.team.id,
      planId: Number(assignPlanId),
      targetUserId: assignTarget.userId,
      paymentMethod: assignPaymentMethod || null,
      paymentReference: assignPaymentReference || null,
      adminNotes: assignNotes || null,
      periodDays:
        assignPeriodDays.trim() === "" || !Number.isFinite(days)
          ? undefined
          : Math.max(0, Math.floor(days)),
    });
  };

  // Block / unblock dialog ----------------------------------------------------
  const [blockTarget, setBlockTarget] = useState<ClientRow | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const blockMutation = api.adminClients.setBlocked.useMutation({
    onSuccess: async (user) => {
      toast.success(
        user.isBlocked ? "Cliente suspendido" : "Cliente reactivado",
      );
      await invalidateAll();
      setBlockTarget(null);
      setBlockReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Clientes</h2>
        <Link
          href="/admin/activations"
          className="text-sm text-primary hover:underline"
        >
          Ver solicitudes de activación →
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Usuarios con rol CLIENT. Cada uno tiene su propio plan y vigencia.
        Desde acá asignás o renovás planes y suspendés a quien no pague.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por email o nombre"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <Select
          value={planFilter}
          onValueChange={(v) => {
            setPlanFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los planes</SelectItem>
            {plans?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={stateFilter}
          onValueChange={(v) => {
            setStateFilter(v as typeof stateFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="blocked">Suspendidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-2">Cliente</th>
                <th className="py-2">Team</th>
                <th className="py-2">Dominios</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Vigencia</th>
                <th className="py-2">Estado</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data?.clients.map((c) => (
                <tr key={c.userId} className="border-t align-top">
                  <td className="py-2">
                    <div className="font-medium">{c.email ?? `#${c.userId}`}</div>
                    {c.name ? (
                      <div className="text-xs text-muted-foreground">{c.name}</div>
                    ) : null}
                  </td>
                  <td className="py-2 text-xs">
                    {c.team.name}
                    <div className="text-muted-foreground">#{c.team.id}</div>
                  </td>
                  <td className="py-2">{c.domainsCount}</td>
                  <td className="py-2">
                    {c.plan ? (
                      c.plan.name
                    ) : (
                      <span className="text-muted-foreground">Sin plan (gratuito)</span>
                    )}
                  </td>
                  <td className="py-2 text-xs">
                    <ValidityCell client={c} />
                  </td>
                  <td className="py-2">
                    {c.isBlocked ? (
                      <div>
                        <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          Suspendido
                        </span>
                        {c.blockedReason ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {c.blockedReason}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-900 dark:bg-green-900/30 dark:text-green-100">
                        Activo
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => openAssign(c)}>
                        {c.activeActivation ? "Renovar" : "Asignar plan"}
                      </Button>
                      {c.isBlocked ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={blockMutation.isPending}
                          onClick={() =>
                            blockMutation.mutate({
                              userId: c.userId,
                              blocked: false,
                            })
                          }
                        >
                          Reactivar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setBlockTarget(c);
                            setBlockReason("");
                          }}
                        >
                          Suspender
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data?.clients.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No hay clientes que coincidan. Los clientes se crean
                    invitándolos con rol CLIENT desde Configuración → Equipo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total: {data?.total ?? 0}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!data || page * data.pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente →
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && closeAssign()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {assignTarget?.activeActivation ? "Renovar plan" : "Asignar plan"}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {assignTarget?.email ?? ""}. El plan se activa de inmediato, el
            período anterior se cierra y el cliente recibe un correo con la
            nueva fecha de vencimiento.
          </p>

          <div className="space-y-3">
            <label className="block text-sm">
              Plan
              <Select value={assignPlanId} onValueChange={setAssignPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans
                    ?.filter((p) => p.isActive)
                    .map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                        {p.priceMonthly && Number(p.priceMonthly) > 0
                          ? ` · ${p.currency} $${Number(p.priceMonthly).toFixed(2)}/mes`
                          : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block text-sm">
              Vigencia (días)
              <Input
                type="number"
                min={0}
                value={assignPeriodDays}
                onChange={(e) => setAssignPeriodDays(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                30 = un mes. 0 = sin vencimiento.
              </p>
            </label>

            <label className="block text-sm">
              Método de pago
              <Input
                value={assignPaymentMethod}
                onChange={(e) => setAssignPaymentMethod(e.target.value)}
                placeholder="Ej: Transferencia Bancolombia, Nequi, dLocal Go link"
              />
            </label>

            <label className="block text-sm">
              Referencia de pago
              <Input
                value={assignPaymentReference}
                onChange={(e) => setAssignPaymentReference(e.target.value)}
                placeholder="TX #123456"
              />
            </label>

            <label className="block text-sm">
              Notas internas
              <Textarea
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                rows={2}
              />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAssign}>
              Cancelar
            </Button>
            <Button onClick={submitAssign} disabled={assignMutation.isPending}>
              {assignMutation.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                "Activar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!blockTarget}
        onOpenChange={(open) => !open && setBlockTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspender cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {blockTarget?.email ?? ""} conserva su plan y sus dominios, pero
            todos sus envíos fallan hasta que lo reactives. Su equipo y los
            demás clientes no se ven afectados.
          </p>
          <label className="block text-sm">
            Motivo (visible para el cliente en su panel)
            <Textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={2}
              placeholder="Ej: Pago pendiente del período de septiembre"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={blockMutation.isPending}
              onClick={() =>
                blockTarget &&
                blockMutation.mutate({
                  userId: blockTarget.userId,
                  blocked: true,
                  reason: blockReason.trim() || null,
                })
              }
            >
              Suspender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ValidityCell({ client }: { client: ClientRow }) {
  const activation = client.activeActivation;
  if (!activation) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (!activation.expiresAt) {
    return <span>Sin vencimiento</span>;
  }
  const date = new Date(activation.expiresAt);
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  const tone =
    daysLeft <= 1
      ? "text-destructive"
      : daysLeft <= 7
        ? "text-yellow-700 dark:text-yellow-400"
        : "";
  return (
    <div className={tone}>
      <div>Vence {format(date, "yyyy-MM-dd")}</div>
      <div className="text-muted-foreground">
        {daysLeft > 0 ? `${daysLeft} día${daysLeft === 1 ? "" : "s"}` : "hoy"}
      </div>
    </div>
  );
}
