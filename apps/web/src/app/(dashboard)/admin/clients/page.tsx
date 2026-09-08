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
  blockedBySystem: boolean;
  lastInvoice: {
    id: string;
    number: string;
    status: "ISSUED" | "PAID" | "VOID";
    amount: number;
    currency: string;
    dueAt: Date | string | null;
    paidAt: Date | string | null;
  } | null;
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
  const { data: teams } = api.adminTeams.list.useQuery({ page: 1, pageSize: 100 });
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

  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const downloadInvoice = async (id: string) => {
    setDownloadingInvoice(id);
    try {
      const file = await utils.adminClients.invoicePdf.fetch({ id });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setDownloadingInvoice(null);
    }
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

  // New client dialog ---------------------------------------------------------
  const [newOpen, setNewOpen] = useState(false);
  const [newTeamId, setNewTeamId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newDomainIds, setNewDomainIds] = useState<number[]>([]);
  const [newPlanId, setNewPlanId] = useState("");
  const [newPeriodDays, setNewPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [newPaymentReference, setNewPaymentReference] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newWelcome, setNewWelcome] = useState(true);

  const effectiveNewTeamId =
    newTeamId || (teams?.teams.length === 1 ? String(teams.teams[0]!.id) : "");

  const { data: teamDomains } = api.adminClients.teamDomains.useQuery(
    { teamId: Number(effectiveNewTeamId) },
    { enabled: newOpen && !!effectiveNewTeamId },
  );

  const closeNew = () => {
    setNewOpen(false);
    setNewTeamId("");
    setNewEmail("");
    setNewName("");
    setNewDomainIds([]);
    setNewPlanId("");
    setNewPeriodDays(DEFAULT_PERIOD_DAYS);
    setNewPaymentMethod("");
    setNewPaymentReference("");
    setNewNotes("");
    setNewWelcome(true);
  };

  const createMutation = api.adminClients.create.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.created
          ? "Cliente creado" + (result.activationId ? " y plan activado" : "")
          : "Cliente vinculado" + (result.activationId ? " y plan activado" : ""),
      );
      await invalidateAll();
      closeNew();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitNew = () => {
    if (!effectiveNewTeamId) {
      toast.error("Selecciona un team");
      return;
    }
    if (!newEmail.trim()) {
      toast.error("Ingresa el email del cliente");
      return;
    }
    const days = Number(newPeriodDays.trim());
    createMutation.mutate({
      teamId: Number(effectiveNewTeamId),
      email: newEmail.trim(),
      name: newName.trim() || null,
      domainIds: newDomainIds,
      planId: newPlanId ? Number(newPlanId) : null,
      periodDays:
        newPeriodDays.trim() === "" || !Number.isFinite(days)
          ? undefined
          : Math.max(0, Math.floor(days)),
      paymentMethod: newPaymentMethod || null,
      paymentReference: newPaymentReference || null,
      adminNotes: newNotes || null,
      sendWelcomeEmail: newWelcome,
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
        <div className="flex items-center gap-3">
          <Link
            href="/admin/activations"
            className="text-sm text-primary hover:underline"
          >
            Ver solicitudes de activación →
          </Link>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            + Nuevo cliente
          </Button>
        </div>
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
                <th className="py-2">Factura</th>
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
                  <td className="py-2 text-xs">
                    {c.lastInvoice ? (
                      <div>
                        <button
                          onClick={() => downloadInvoice(c.lastInvoice!.id)}
                          disabled={downloadingInvoice === c.lastInvoice.id}
                          className="font-mono text-primary hover:underline disabled:opacity-50"
                          title="Descargar PDF"
                        >
                          {c.lastInvoice.number}
                        </button>
                        <div className="text-muted-foreground">
                          {c.lastInvoice.status === "PAID"
                            ? "Pagada"
                            : c.lastInvoice.status === "ISSUED"
                              ? "Pendiente"
                              : "Anulada"}
                          {" · "}
                          {c.lastInvoice.currency} {c.lastInvoice.amount.toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No hay clientes que coincidan. Creá uno con "+ Nuevo
                    cliente".
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

      <Dialog open={newOpen} onOpenChange={(open) => !open && closeNew()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Crea la cuenta del cliente con rol CLIENT, le asigna los dominios
            desde los que puede enviar y, si elegís un plan, lo activa de
            inmediato. El cliente ingresa con este mismo email por código de
            acceso, Google o GitHub.
          </p>

          <div className="space-y-3">
            {teams && teams.teams.length > 1 ? (
              <label className="block text-sm">
                Team
                <Select value={effectiveNewTeamId} onValueChange={(v) => { setNewTeamId(v); setNewDomainIds([]); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un team" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {teams.teams.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        #{t.id} — {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}

            <label className="block text-sm">
              Email del cliente
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="cliente@empresa.com"
              />
            </label>

            <label className="block text-sm">
              Nombre o empresa
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme S.A.S."
              />
            </label>

            <div className="text-sm">
              Dominios de envío
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                {teamDomains?.length ? (
                  teamDomains.map((d) => {
                    const checked = newDomainIds.includes(d.id);
                    const holder = d.holders[0];
                    return (
                      <label key={d.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setNewDomainIds((ids) =>
                              e.target.checked
                                ? [...ids, d.id]
                                : ids.filter((id) => id !== d.id),
                            )
                          }
                        />
                        <span>{d.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {d.status === "SUCCESS" ? "verificado" : d.status.toLowerCase()}
                          {holder ? ` · ya asignado a ${holder.email ?? holder.id}` : ""}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No hay dominios en el team. El cliente podrá agregar los
                    suyos al ingresar.
                  </span>
                )}
              </div>
            </div>

            <label className="block text-sm">
              Plan inicial (opcional)
              <Select value={newPlanId} onValueChange={setNewPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin plan por ahora (gratuito)" />
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

            {newPlanId ? (
              <>
                <label className="block text-sm">
                  Vigencia (días)
                  <Input
                    type="number"
                    min={0}
                    value={newPeriodDays}
                    onChange={(e) => setNewPeriodDays(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    30 = un mes. 0 = sin vencimiento.
                  </p>
                </label>
                <label className="block text-sm">
                  Método de pago
                  <Input
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value)}
                    placeholder="Ej: Transferencia Bancolombia, Nequi"
                  />
                </label>
                <label className="block text-sm">
                  Referencia de pago
                  <Input
                    value={newPaymentReference}
                    onChange={(e) => setNewPaymentReference(e.target.value)}
                    placeholder="TX #123456"
                  />
                </label>
              </>
            ) : null}

            <label className="block text-sm">
              Notas internas
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newWelcome}
                onChange={(e) => setNewWelcome(e.target.checked)}
              />
              Enviar correo de bienvenida con instrucciones de acceso
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeNew}>
              Cancelar
            </Button>
            <Button onClick={submitNew} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                "Crear cliente"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && closeAssign()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {assignTarget?.activeActivation ? "Renovar plan" : "Asignar plan"}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {assignTarget?.email ?? ""}. El plan se activa de inmediato, el
            período anterior se cierra, se levanta una suspensión por
            vencimiento y el cliente recibe la factura en PDF con la nueva
            fecha de vencimiento.
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
