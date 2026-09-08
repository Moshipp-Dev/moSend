"use client";

import { useState } from "react";
import { PlanActivationStatus } from "@prisma/client";
import { Button } from "@usesend/ui/src/button";
import { Textarea } from "@usesend/ui/src/textarea";
import { Input } from "@usesend/ui/src/input";
import { toast } from "@usesend/ui/src/toaster";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { api } from "~/trpc/react";
import { daysUntil, formatDate, formatDateTime, formatMoney } from "~/lib/format";
import {
  ACTIVATION_STATUS,
  AdminPage,
  Cell,
  CellStack,
  ConfirmDialog,
  DataTable,
  Field,
  FilterBar,
  Pill,
  Row,
  RowActions,
  TablePagination,
} from "~/components/admin/kit";

type StatusFilter = PlanActivationStatus | "ALL";

const DEFAULT_PERIOD_DAYS = "30";

// "" or non-numeric → let the server apply its default; "0" → sin vencimiento.
function parsePeriodDays(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

const COLUMNS = [
  { label: "Solicitud" },
  { label: "Cliente" },
  { label: "Plan" },
  { label: "Pago" },
  { label: "Vigencia" },
  { label: "Estado" },
  { label: "Acciones", className: "text-right" },
];

export default function AdminActivationsPage() {
  const utils = api.useUtils();
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [page, setPage] = useState(1);

  const { data, isLoading } = api.adminActivations.list.useQuery({
    status: status === "ALL" ? undefined : status,
    page,
    pageSize: 25,
  });

  const invalidateAll = async () => {
    await Promise.all([
      utils.adminActivations.list.invalidate(),
      utils.adminClients.list.invalidate(),
      utils.adminInvoices.list.invalidate(),
    ]);
  };

  // Approve / reject ----------------------------------------------------------
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"approve" | "reject" | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvePeriodDays, setApprovePeriodDays] = useState(DEFAULT_PERIOD_DAYS);

  const closeDialog = () => {
    setActionRequestId(null);
    setActionMode(null);
    setPaymentReference("");
    setAdminNotes("");
    setRejectionReason("");
    setApprovePeriodDays(DEFAULT_PERIOD_DAYS);
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

  // Manual activation / renewal ----------------------------------------------
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

  const createManualMutation = api.adminActivations.createManual.useMutation({
    onSuccess: async () => {
      toast.success("Activación creada y plan asignado");
      await invalidateAll();
      closeManual();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitManual = () => {
    if (!manualTeamId || !manualPlanId) {
      toast.error("Selecciona team y plan");
      return;
    }
    createManualMutation.mutate({
      teamId: Number(manualTeamId),
      planId: Number(manualPlanId),
      targetUserId: manualUserId ? Number(manualUserId) : null,
      paymentMethod: manualPaymentMethod || null,
      paymentReference: manualPaymentReference || null,
      adminNotes: manualAdminNotes || null,
      periodDays: parsePeriodDays(manualPeriodDays),
    });
  };

  const pendingCount = status === "PENDING" ? (data?.total ?? 0) : null;

  return (
    <AdminPage
      title="Activaciones"
      description="Solicitudes de plan de los clientes y activaciones hechas a mano. Aprobar asigna el plan de inmediato, registra el pago y avisa al cliente por correo."
      actions={<Button onClick={() => setManualOpen(true)}>Nueva activación manual</Button>}
    >
      <FilterBar>
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
            <SelectItem value="APPROVED">Activas</SelectItem>
            <SelectItem value="EXPIRED">Vencidas</SelectItem>
            <SelectItem value="REJECTED">Rechazadas</SelectItem>
            <SelectItem value="CANCELLED">Canceladas</SelectItem>
            <SelectItem value="ALL">Todas</SelectItem>
          </SelectContent>
        </Select>
        {pendingCount !== null && pendingCount > 0 ? (
          <Pill tone="warning">
            {pendingCount} por revisar
          </Pill>
        ) : null}
      </FilterBar>

      <DataTable
        columns={COLUMNS}
        isLoading={isLoading}
        isEmpty={data?.requests.length === 0}
        emptyMessage={
          status === "PENDING"
            ? "No hay solicitudes pendientes. Cuando un cliente pida un plan desde /pricing aparece acá."
            : "No hay solicitudes en este estado."
        }
      >
        {data?.requests.map((r) => {
          const st = ACTIVATION_STATUS[r.status];
          return (
            <Row key={r.id}>
              <Cell>
                <CellStack
                  primary={formatDate(r.createdAt)}
                  secondary={formatDateTime(r.createdAt).split(",").pop()?.trim()}
                />
              </Cell>
              <Cell>
                {r.targetUser ? (
                  <CellStack
                    primary={r.targetUser.email ?? r.targetUser.name ?? `#${r.targetUser.id}`}
                    secondary={r.targetUser.name && r.targetUser.email ? r.targetUser.name : `Team ${r.team.name}`}
                  />
                ) : (
                  <CellStack primary="Team completo" secondary={r.team.name} />
                )}
              </Cell>
              <Cell>
                <CellStack
                  primary={r.plan.name}
                  secondary={
                    Number(r.plan.priceMonthly) > 0
                      ? `${formatMoney(Number(r.plan.priceMonthly), r.plan.currency)} / mes`
                      : "Gratis"
                  }
                />
              </Cell>
              <Cell>
                <CellStack
                  primary={r.paymentMethod ?? <span className="text-muted-foreground">—</span>}
                  secondary={r.paymentReference}
                />
              </Cell>
              <Cell>
                <ValidityCell status={r.status} expiresAt={r.expiresAt} expiredAt={r.expiredAt} />
              </Cell>
              <Cell>
                <div className="space-y-1">
                  <Pill tone={st.tone}>{st.label}</Pill>
                  {r.reviewedAt ? (
                    <div className="text-xs text-muted-foreground">{formatDate(r.reviewedAt)}</div>
                  ) : null}
                </div>
              </Cell>
              <Cell>
                <RowActions>
                  {r.status === "PENDING" ? (
                    <>
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
                    </>
                  ) : r.status === "APPROVED" || r.status === "EXPIRED" ? (
                    <Button size="sm" variant="outline" onClick={() => openRenewal(r)}>
                      Renovar
                    </Button>
                  ) : null}
                </RowActions>
              </Cell>
            </Row>
          );
        })}
      </DataTable>

      <TablePagination
        page={page}
        pageSize={data?.pageSize ?? 25}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />

      <ConfirmDialog
        open={manualOpen}
        onOpenChange={(open) => !open && closeManual()}
        title={manualTitle}
        description="Crea una activación ya aprobada. Útil cuando el pago se confirmó por fuera, o para renovar un plan que está por vencer. El cliente recibe la confirmación con la factura por correo."
        confirmLabel="Crear y activar"
        pending={createManualMutation.isPending}
        onConfirm={submitManual}
      >
        <div className="space-y-3">
          <Field label="Team">
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
          </Field>

          <Field
            label="Cliente"
            hint="Si elegís un cliente, el plan es solo para él. Vacío asigna el plan al team completo."
          >
            <Select value={manualUserId} onValueChange={setManualUserId} disabled={!manualTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Team completo o un cliente específico" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {usersForPicker?.map((u) => (
                  <SelectItem key={u.userId} value={String(u.userId)}>
                    {u.email ?? u.name ?? `#${u.userId}`} · {u.role}
                    {u.plan ? ` · ${u.plan.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Plan">
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
                      {Number(p.priceMonthly) > 0
                        ? ` · ${formatMoney(Number(p.priceMonthly), p.currency)}/mes`
                        : " · gratis"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Vigencia (días)"
            hint="30 = un mes. 0 = sin vencimiento. Al vencer sin pago la cuenta se suspende y recibe avisos 7 y 1 día antes."
          >
            <Input
              type="number"
              min={0}
              value={manualPeriodDays}
              onChange={(e) => setManualPeriodDays(e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Método de pago">
              <Input
                value={manualPaymentMethod}
                onChange={(e) => setManualPaymentMethod(e.target.value)}
                placeholder="Transferencia, Nequi…"
              />
            </Field>
            <Field label="Referencia de pago">
              <Input
                value={manualPaymentReference}
                onChange={(e) => setManualPaymentReference(e.target.value)}
                placeholder="TX #123456"
              />
            </Field>
          </div>

          <Field label="Notas internas">
            <Textarea
              value={manualAdminNotes}
              onChange={(e) => setManualAdminNotes(e.target.value)}
              rows={2}
            />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!actionMode}
        onOpenChange={(open) => !open && closeDialog()}
        title={actionMode === "approve" ? "Aprobar y activar plan" : "Rechazar solicitud"}
        description={
          actionMode === "approve"
            ? "El plan se asigna de inmediato y el cliente recibe la confirmación con la factura. Guarda el comprobante para el historial."
            : "El cliente recibe un correo con el motivo del rechazo."
        }
        confirmLabel={actionMode === "approve" ? "Aprobar y activar" : "Rechazar"}
        destructive={actionMode === "reject"}
        pending={approveMutation.isPending || rejectMutation.isPending}
        onConfirm={submitAction}
      >
        {actionMode === "approve" ? (
          <div className="space-y-3">
            <Field label="Vigencia (días)" hint="30 = un mes. 0 = sin vencimiento.">
              <Input
                type="number"
                min={0}
                value={approvePeriodDays}
                onChange={(e) => setApprovePeriodDays(e.target.value)}
              />
            </Field>
            <Field label="Referencia de pago">
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Ej: Bancolombia TX #123456"
              />
            </Field>
            <Field label="Notas internas">
              <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={2} />
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Motivo del rechazo" hint="Se envía al cliente por correo.">
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                required
              />
            </Field>
            <Field label="Notas internas">
              <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={2} />
            </Field>
          </div>
        )}
      </ConfirmDialog>
    </AdminPage>
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
    if (!expiresAt) return <span className="text-sm">Sin vencimiento</span>;
    const left = daysUntil(expiresAt);
    const tone = left <= 1 ? "danger" : left <= 7 ? "warning" : "neutral";
    return (
      <div className="space-y-1">
        <div className="text-sm">Vence {formatDate(expiresAt)}</div>
        <Pill tone={tone}>{left > 0 ? `${left} día${left === 1 ? "" : "s"}` : "Hoy"}</Pill>
      </div>
    );
  }
  if (status === "EXPIRED") {
    return (
      <span className="text-sm text-muted-foreground">
        Venció {expiredAt ? formatDate(expiredAt) : ""}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}
