"use client";

import { useState } from "react";
import { PlanActivationStatus } from "@prisma/client";
import { Button } from "@usesend/ui/src/button";
import { Textarea } from "@usesend/ui/src/textarea";
import { Input } from "@usesend/ui/src/input";
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

type StatusFilter = PlanActivationStatus | "ALL";

const DEFAULT_PERIOD_DAYS = "30";

// "" or non-numeric → let the server apply its default; "0" → sin vencimiento.
function parsePeriodDays(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export default function AdminActivationsPage() {
  const utils = api.useUtils();
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [page, setPage] = useState(1);

  const { data, isLoading } = api.adminActivations.list.useQuery({
    status: status === "ALL" ? undefined : status,
    page,
    pageSize: 25,
  });

  const [actionRequestId, setActionRequestId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"approve" | "reject" | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvePeriodDays, setApprovePeriodDays] = useState(DEFAULT_PERIOD_DAYS);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("Nueva activación manual");
  const [manualTeamId, setManualTeamId] = useState<string>("");
  const [manualUserId, setManualUserId] = useState<string>("");
  const [manualPlanId, setManualPlanId] = useState<string>("");
  const [manualPaymentMethod, setManualPaymentMethod] = useState("");
  const [manualPaymentReference, setManualPaymentReference] = useState("");
  const [manualAdminNotes, setManualAdminNotes] = useState("");
  const [manualPeriodDays, setManualPeriodDays] = useState(DEFAULT_PERIOD_DAYS);

  const { data: teamsForPicker } = api.adminTeams.list.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: manualOpen },
  );
  const { data: plansForPicker } = api.adminPlans.list.useQuery(undefined, {
    enabled: manualOpen,
  });
  const { data: usersForPicker } = api.adminTeams.listUsers.useQuery(
    { teamId: Number(manualTeamId) },
    { enabled: manualOpen && !!manualTeamId },
  );

  const invalidateAll = async () => {
    await Promise.all([
      utils.adminActivations.list.invalidate(),
      utils.adminClients.list.invalidate(),
    ]);
  };

  const createManualMutation = api.adminActivations.createManual.useMutation({
    onSuccess: async () => {
      toast.success("Activación creada y plan asignado");
      await invalidateAll();
      closeManual();
    },
    onError: (e) => toast.error(e.message),
  });

  const closeManual = () => {
    setManualOpen(false);
    setManualTitle("Nueva activación manual");
    setManualTeamId("");
    setManualUserId("");
    setManualPlanId("");
    setManualPaymentMethod("");
    setManualPaymentReference("");
    setManualAdminNotes("");
    setManualPeriodDays(DEFAULT_PERIOD_DAYS);
  };

  // Renewal = a fresh manual activation prefilled with the same target/plan.
  const openRenewal = (r: {
    team: { id: number };
    targetUser: { id: number } | null;
    plan: { id: number };
    paymentMethod: string | null;
  }) => {
    setManualTitle("Renovar plan");
    setManualTeamId(String(r.team.id));
    setManualUserId(r.targetUser ? String(r.targetUser.id) : "");
    setManualPlanId(String(r.plan.id));
    setManualPaymentMethod(r.paymentMethod ?? "");
    setManualPeriodDays(DEFAULT_PERIOD_DAYS);
    setManualOpen(true);
  };

  const submitManual = () => {
    if (!manualTeamId || !manualPlanId) {
      toast.error("Selecciona team y plan");
      return;
    }
    createManualMutation.mutate({
      teamId: Number(manualTeamId),
      planId: Number(manualPlanId),
      // Empty user picker = team-wide assignment (legacy); otherwise the plan
      // goes to that specific user's pricingPlanId.
      targetUserId: manualUserId ? Number(manualUserId) : null,
      paymentMethod: manualPaymentMethod || null,
      paymentReference: manualPaymentReference || null,
      adminNotes: manualAdminNotes || null,
      periodDays: parsePeriodDays(manualPeriodDays),
    });
  };

  const approveMutation = api.adminActivations.approve.useMutation({
    onSuccess: async () => {
      toast.success("Plan activado y cliente notificado");
      await invalidateAll();
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = api.adminActivations.reject.useMutation({
    onSuccess: async () => {
      toast.success("Solicitud rechazada y cliente notificado");
      await invalidateAll();
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const closeDialog = () => {
    setActionRequestId(null);
    setActionMode(null);
    setPaymentReference("");
    setAdminNotes("");
    setRejectionReason("");
    setApprovePeriodDays(DEFAULT_PERIOD_DAYS);
  };

  const submitAction = () => {
    if (!actionRequestId) return;
    if (actionMode === "approve") {
      approveMutation.mutate({
        requestId: actionRequestId,
        paymentReference: paymentReference || null,
        adminNotes: adminNotes || null,
        periodDays: parsePeriodDays(approvePeriodDays),
      });
    } else if (actionMode === "reject") {
      if (rejectionReason.trim().length < 3) {
        toast.error("Ingresa un motivo de rechazo");
        return;
      }
      rejectMutation.mutate({
        requestId: actionRequestId,
        rejectionReason: rejectionReason.trim(),
        adminNotes: adminNotes || null,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Solicitudes de activación</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setManualOpen(true)}>
            + Nueva activación manual
          </Button>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as StatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pendientes</SelectItem>
              <SelectItem value="APPROVED">Aprobadas</SelectItem>
              <SelectItem value="EXPIRED">Vencidas</SelectItem>
              <SelectItem value="REJECTED">Rechazadas</SelectItem>
              <SelectItem value="CANCELLED">Canceladas</SelectItem>
              <SelectItem value="ALL">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-2">Fecha</th>
                <th className="py-2">Cliente</th>
                <th className="py-2">Team</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Método</th>
                <th className="py-2">Vigencia</th>
                <th className="py-2">Estado</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data?.requests.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-2 text-xs">
                    {format(new Date(r.createdAt), "yyyy-MM-dd HH:mm")}
                  </td>
                  <td className="py-2">
                    {r.targetUser ? (
                      <>
                        <div className="font-medium">
                          {r.targetUser.email ?? r.targetUser.name ?? `#${r.targetUser.id}`}
                        </div>
                        {r.targetUser.name && r.targetUser.email ? (
                          <div className="text-xs text-muted-foreground">
                            {r.targetUser.name}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Team completo
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <div>{r.team.name}</div>
                    <div className="text-xs text-muted-foreground">
                      #{r.team.id}
                      {r.team.billingEmail ? ` · ${r.team.billingEmail}` : ""}
                    </div>
                  </td>
                  <td className="py-2">{r.plan.name}</td>
                  <td className="py-2 text-xs">
                    <div>{r.paymentMethod ?? "—"}</div>
                    {r.paymentReference ? (
                      <div className="text-muted-foreground">{r.paymentReference}</div>
                    ) : null}
                  </td>
                  <td className="py-2 text-xs">
                    <ValidityCell
                      status={r.status}
                      expiresAt={r.expiresAt}
                      expiredAt={r.expiredAt}
                    />
                  </td>
                  <td className="py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2 text-right">
                    {r.status === "PENDING" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setActionRequestId(r.id);
                            setActionMode("approve");
                          }}
                        >
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionRequestId(r.id);
                            setActionMode("reject");
                          }}
                        >
                          Rechazar
                        </Button>
                      </div>
                    ) : r.status === "APPROVED" || r.status === "EXPIRED" ? (
                      <div className="flex flex-col items-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRenewal(r)}
                        >
                          Renovar
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {r.reviewedAt
                            ? format(new Date(r.reviewedAt), "yyyy-MM-dd HH:mm")
                            : ""}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {r.reviewedAt
                          ? format(new Date(r.reviewedAt), "yyyy-MM-dd HH:mm")
                          : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data?.requests.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No hay solicitudes en este estado.
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

      <Dialog open={manualOpen} onOpenChange={(open) => !open && closeManual()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{manualTitle}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Crea una activación ya aprobada. Útil cuando el pago se confirmó
            por fuera, o para renovar un plan que está por vencer. El cliente
            recibe un correo con la confirmación y la fecha de vencimiento.
          </p>

          <div className="space-y-3">
            <label className="block text-sm">
              Team
              <Select
                value={manualTeamId}
                onValueChange={(v) => {
                  setManualTeamId(v);
                  setManualUserId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un team" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {teamsForPicker?.teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      #{t.id} — {t.name}
                      {t.billingEmail ? ` (${t.billingEmail})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block text-sm">
              Cliente (usuario del team)
              <Select
                value={manualUserId}
                onValueChange={setManualUserId}
                disabled={!manualTeamId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Plan al team (vacío) o a un cliente específico" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {usersForPicker?.map((u) => (
                    <SelectItem key={u.userId} value={String(u.userId)}>
                      {u.email ?? u.name ?? `#${u.userId}`} — {u.role}
                      {u.plan ? ` · ${u.plan.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Si elegís un cliente, el plan se asigna solo a él (modelo
                CLIENT). Si lo dejás vacío, se asigna al team completo.
              </p>
            </label>

            <label className="block text-sm">
              Plan
              <Select value={manualPlanId} onValueChange={setManualPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plansForPicker
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
                value={manualPeriodDays}
                onChange={(e) => setManualPeriodDays(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                30 = un mes. 0 = sin vencimiento. Al vencer, el cliente pasa
                al plan gratuito y recibe avisos 7 y 1 día antes.
              </p>
            </label>

            <label className="block text-sm">
              Método de pago
              <Input
                value={manualPaymentMethod}
                onChange={(e) => setManualPaymentMethod(e.target.value)}
                placeholder="Ej: Transferencia Bancolombia, Nequi, dLocal Go link"
              />
            </label>

            <label className="block text-sm">
              Referencia de pago
              <Input
                value={manualPaymentReference}
                onChange={(e) => setManualPaymentReference(e.target.value)}
                placeholder="TX #123456"
              />
            </label>

            <label className="block text-sm">
              Notas internas
              <Textarea
                value={manualAdminNotes}
                onChange={(e) => setManualAdminNotes(e.target.value)}
                rows={2}
              />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeManual}>
              Cancelar
            </Button>
            <Button
              onClick={submitManual}
              disabled={createManualMutation.isPending}
            >
              {createManualMutation.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                "Crear y activar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionMode} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionMode === "approve"
                ? "Aprobar y activar plan"
                : "Rechazar solicitud"}
            </DialogTitle>
          </DialogHeader>

          {actionMode === "approve" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Al aprobar, el plan se asigna inmediatamente y el cliente
                recibe un correo de confirmación. Guarda el comprobante del
                pago para el historial.
              </p>
              <label className="block text-sm">
                Vigencia (días)
                <Input
                  type="number"
                  min={0}
                  value={approvePeriodDays}
                  onChange={(e) => setApprovePeriodDays(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  30 = un mes. 0 = sin vencimiento.
                </p>
              </label>
              <label className="block text-sm">
                Referencia de pago
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Ej: Bancolombia TX #123456"
                />
              </label>
              <label className="block text-sm">
                Notas internas
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                Motivo del rechazo (se envía al cliente por correo)
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  required
                />
              </label>
              <label className="block text-sm">
                Notas internas
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                />
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              onClick={submitAction}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              variant={actionMode === "reject" ? "destructive" : "default"}
            >
              {actionMode === "approve" ? "Aprobar y activar" : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ValidityCell({
  status,
  expiresAt,
  expiredAt,
}: {
  status: PlanActivationStatus;
  expiresAt: Date | string | null;
  expiredAt: Date | string | null;
}) {
  if (status === "APPROVED") {
    if (!expiresAt) return <span>Sin vencimiento</span>;
    const date = new Date(expiresAt);
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
  if (status === "EXPIRED") {
    return (
      <span className="text-muted-foreground">
        Venció {expiredAt ? format(new Date(expiredAt), "yyyy-MM-dd") : ""}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function StatusBadge({ status }: { status: PlanActivationStatus }) {
  const styles = {
    PENDING: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100",
    APPROVED: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-100",
    EXPIRED: "bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-100",
    REJECTED: "bg-destructive/10 text-destructive",
    CANCELLED: "bg-muted text-muted-foreground",
  } as const;
  const labels = {
    PENDING: "Pendiente",
    APPROVED: "Aprobada",
    EXPIRED: "Vencida",
    REJECTED: "Rechazada",
    CANCELLED: "Cancelada",
  } as const;
  return (
    <span className={`rounded-full px-2 py-1 text-xs ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
