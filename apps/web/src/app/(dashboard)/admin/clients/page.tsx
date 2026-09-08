"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Textarea } from "@usesend/ui/src/textarea";
import { toast } from "@usesend/ui/src/toaster";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { api } from "~/trpc/react";
import { daysUntil, formatDate, formatMoney } from "~/lib/format";
import {
  AdminPage,
  Cell,
  CellStack,
  ConfirmDialog,
  DataTable,
  Field,
  FilterBar,
  INVOICE_STATUS,
  Pill,
  Row,
  RowActions,
  StatGrid,
  StatTile,
  TablePagination,
  savePdf,
} from "~/components/admin/kit";

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

const COLUMNS = [
  { label: "Cliente" },
  { label: "Plan" },
  { label: "Vigencia" },
  { label: "Última factura" },
  { label: "Estado" },
  { label: "Acciones", className: "text-right" },
];

// "" → server default; 0 → sin vencimiento when allowed; otherwise whole days.
function parseDays(value: string, allowZero: boolean): number | undefined | null {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 0) return allowZero ? 0 : null;
  return Math.floor(n);
}

// Operator view of billable customers (CLIENT users): create them, assign or
// renew plans, issue cuentas de cobro, suspend or reactivate.
export default function AdminClientsPage() {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "blocked">("all");

  const { data: plans } = api.adminPlans.list.useQuery();
  const { data: teams } = api.adminTeams.list.useQuery({ page: 1, pageSize: 100 });
  const { data, isLoading } = api.adminClients.list.useQuery({
    search: search || undefined,
    planId: planFilter === "all" ? undefined : Number(planFilter),
    blocked: stateFilter === "all" ? undefined : stateFilter === "blocked",
    page,
    pageSize: 25,
  });

  const invalidateAll = async () => {
    await Promise.all([
      utils.adminClients.list.invalidate(),
      utils.adminActivations.list.invalidate(),
      utils.adminInvoices.list.invalidate(),
    ]);
  };

  const activePlans = plans?.filter((p) => p.isActive) ?? [];
  const billablePlans = activePlans.filter((p) => Number(p.priceMonthly) > 0);
  const planOption = (p: { id: number; name: string; priceMonthly: unknown; currency: string }) => (
    <SelectItem key={p.id} value={String(p.id)}>
      {p.name}
      {Number(p.priceMonthly) > 0
        ? ` · ${formatMoney(Number(p.priceMonthly), p.currency)}/mes`
        : " · gratis"}
    </SelectItem>
  );

  // Summary tiles ------------------------------------------------------------
  const clients = data?.clients ?? [];
  const suspended = clients.filter((c) => c.isBlocked).length;
  const expiringSoon = clients.filter((c) => {
    const at = c.activeActivation?.expiresAt;
    return at ? daysUntil(at) <= 7 : false;
  }).length;
  const pendingInvoices = clients.filter((c) => c.lastInvoice?.status === "ISSUED").length;

  // PDF ------------------------------------------------------------------------
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const downloadInvoice = async (id: string) => {
    setDownloadingInvoice(id);
    try {
      const file = await utils.adminClients.invoicePdf.fetch({ id });
      savePdf(file.base64, file.filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setDownloadingInvoice(null);
    }
  };

  // Assign / renew -------------------------------------------------------------
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

  const assignMutation = api.adminActivations.createManual.useMutation({
    onSuccess: async () => {
      toast.success("Plan asignado y cliente notificado");
      await invalidateAll();
      setAssignTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const submitAssign = () => {
    if (!assignTarget || !assignPlanId) {
      toast.error("Selecciona un plan");
      return;
    }
    const days = parseDays(assignPeriodDays, true);
    assignMutation.mutate({
      teamId: assignTarget.team.id,
      planId: Number(assignPlanId),
      targetUserId: assignTarget.userId,
      paymentMethod: assignPaymentMethod || null,
      paymentReference: assignPaymentReference || null,
      adminNotes: assignNotes || null,
      periodDays: days === null ? 0 : days,
    });
  };

  // Cuenta de cobro ------------------------------------------------------------
  const [issueTarget, setIssueTarget] = useState<ClientRow | null>(null);
  const [issuePlanId, setIssuePlanId] = useState("");
  const [issuePeriodDays, setIssuePeriodDays] = useState(DEFAULT_PERIOD_DAYS);

  const issueMutation = api.adminClients.issueInvoice.useMutation({
    onSuccess: async (inv) => {
      toast.success(`Cuenta de cobro ${inv.number} enviada al cliente`);
      await invalidateAll();
      setIssueTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const openIssue = (client: ClientRow) => {
    setIssueTarget(client);
    const currentIsBillable = client.plan && billablePlans.some((p) => p.id === client.plan!.id);
    setIssuePlanId(currentIsBillable ? String(client.plan!.id) : "");
    setIssuePeriodDays(DEFAULT_PERIOD_DAYS);
  };

  // Block / unblock ------------------------------------------------------------
  const [blockTarget, setBlockTarget] = useState<ClientRow | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const blockMutation = api.adminClients.setBlocked.useMutation({
    onSuccess: async (user) => {
      toast.success(user.isBlocked ? "Cliente suspendido" : "Cliente reactivado");
      await invalidateAll();
      setBlockTarget(null);
      setBlockReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  // New client -----------------------------------------------------------------
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
        `${result.created ? "Cliente creado" : "Cliente vinculado"}${result.activationId ? " y plan activado" : ""}`,
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
    const days = parseDays(newPeriodDays, true);
    createMutation.mutate({
      teamId: Number(effectiveNewTeamId),
      email: newEmail.trim(),
      name: newName.trim() || null,
      domainIds: newDomainIds,
      planId: newPlanId ? Number(newPlanId) : null,
      periodDays: days === null ? 0 : days,
      paymentMethod: newPaymentMethod || null,
      paymentReference: newPaymentReference || null,
      adminNotes: newNotes || null,
      sendWelcomeEmail: newWelcome,
    });
  };

  return (
    <AdminPage
      title="Clientes"
      description="Cada cliente es un usuario con rol CLIENT, con su propio plan mensual, sus dominios y su vigencia. Desde acá los creás, les asignás o renovás el plan, les emitís la cuenta de cobro y los suspendés si no pagan."
      actions={
        <>
          <Link href="/admin/activations">
            <Button variant="outline">Ver solicitudes</Button>
          </Link>
          <Button onClick={() => setNewOpen(true)}>Nuevo cliente</Button>
        </>
      }
    >
      <StatGrid>
        <StatTile label="Clientes" value={data?.total ?? "—"} />
        <StatTile
          label="Vencen en 7 días"
          value={expiringSoon}
          tone={expiringSoon > 0 ? "warning" : "neutral"}
          hint="En esta página"
        />
        <StatTile
          label="Con cuenta pendiente"
          value={pendingInvoices}
          tone={pendingInvoices > 0 ? "warning" : "neutral"}
          hint="En esta página"
        />
        <StatTile
          label="Suspendidos"
          value={suspended}
          tone={suspended > 0 ? "danger" : "neutral"}
          hint="En esta página"
        />
      </StatGrid>

      <FilterBar>
        <Input
          placeholder="Buscar por email o nombre"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full max-w-sm"
        />
        <Select
          value={planFilter}
          onValueChange={(v) => {
            setPlanFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="blocked">Suspendidos</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={COLUMNS}
        isLoading={isLoading}
        isEmpty={clients.length === 0}
        emptyMessage={
          <span>
            No hay clientes que coincidan. Creá el primero con{" "}
            <button className="text-primary hover:underline" onClick={() => setNewOpen(true)}>
              Nuevo cliente
            </button>
            .
          </span>
        }
      >
        {clients.map((c) => (
          <Row key={c.userId}>
            <Cell>
              <CellStack
                primary={c.email ?? `#${c.userId}`}
                secondary={
                  <>
                    {c.name ? `${c.name} · ` : ""}
                    {c.domainsCount} dominio{c.domainsCount === 1 ? "" : "s"}
                  </>
                }
              />
            </Cell>
            <Cell>
              {c.plan ? (
                <span className="font-medium">{c.plan.name}</span>
              ) : (
                <span className="text-muted-foreground">Gratuito</span>
              )}
            </Cell>
            <Cell>
              <ValidityCell activation={c.activeActivation} />
            </Cell>
            <Cell>
              {c.lastInvoice ? (
                <div className="space-y-1">
                  <button
                    onClick={() => downloadInvoice(c.lastInvoice!.id)}
                    disabled={downloadingInvoice === c.lastInvoice.id}
                    className="font-mono text-xs text-primary hover:underline disabled:opacity-50"
                    title="Descargar PDF"
                  >
                    {c.lastInvoice.number}
                  </button>
                  <div className="flex items-center gap-2 text-xs">
                    <Pill tone={INVOICE_STATUS[c.lastInvoice.status].tone}>
                      {INVOICE_STATUS[c.lastInvoice.status].label}
                    </Pill>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(c.lastInvoice.amount, c.lastInvoice.currency)}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Cell>
            <Cell>
              {c.isBlocked ? (
                <div className="space-y-1">
                  <Pill tone="danger">
                    {c.blockedBySystem ? "Suspendido por vencimiento" : "Suspendido"}
                  </Pill>
                  {c.blockedReason ? (
                    <div className="max-w-[220px] text-xs text-muted-foreground">{c.blockedReason}</div>
                  ) : null}
                </div>
              ) : (
                <Pill tone="success">Activo</Pill>
              )}
            </Cell>
            <Cell>
              <RowActions>
                <Button size="sm" onClick={() => openAssign(c)}>
                  {c.activeActivation ? "Renovar" : "Asignar plan"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openIssue(c)}>
                  Cuenta de cobro
                </Button>
                {c.isBlocked ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={blockMutation.isPending}
                    onClick={() => blockMutation.mutate({ userId: c.userId, blocked: false })}
                  >
                    Reactivar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setBlockTarget(c);
                      setBlockReason("");
                    }}
                  >
                    Suspender
                  </Button>
                )}
              </RowActions>
            </Cell>
          </Row>
        ))}
      </DataTable>

      <TablePagination
        page={page}
        pageSize={data?.pageSize ?? 25}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />

      {/* Nuevo cliente */}
      <ConfirmDialog
        open={newOpen}
        onOpenChange={(open) => !open && closeNew()}
        title="Nuevo cliente"
        description="Crea la cuenta con rol CLIENT, le asigna los dominios desde los que puede enviar y, si elegís un plan, lo activa de inmediato. El cliente ingresa con este mismo email por código de acceso, Google o GitHub."
        confirmLabel="Crear cliente"
        pending={createMutation.isPending}
        onConfirm={submitNew}
      >
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {teams && teams.teams.length > 1 ? (
            <Field label="Team">
              <Select
                value={effectiveNewTeamId}
                onValueChange={(v) => {
                  setNewTeamId(v);
                  setNewDomainIds([]);
                }}
              >
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
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email del cliente">
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="cliente@empresa.com"
              />
            </Field>
            <Field label="Nombre o empresa">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Acme S.A.S." />
            </Field>
          </div>

          <div className="space-y-1 text-sm">
            <span className="font-medium">Dominios de envío</span>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
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
                            e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id),
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
                  No hay dominios en el team. El cliente podrá agregar los suyos al ingresar.
                </span>
              )}
            </div>
          </div>

          <Field label="Plan inicial" hint="Opcional. Sin plan queda en el gratuito.">
            <Select value={newPlanId} onValueChange={setNewPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin plan por ahora" />
              </SelectTrigger>
              <SelectContent>{activePlans.map(planOption)}</SelectContent>
            </Select>
          </Field>

          {newPlanId ? (
            <>
              <Field label="Vigencia (días)" hint="30 = un mes. 0 = sin vencimiento.">
                <Input
                  type="number"
                  min={0}
                  value={newPeriodDays}
                  onChange={(e) => setNewPeriodDays(e.target.value)}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Método de pago">
                  <Input
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value)}
                    placeholder="Transferencia, Nequi…"
                  />
                </Field>
                <Field label="Referencia de pago">
                  <Input
                    value={newPaymentReference}
                    onChange={(e) => setNewPaymentReference(e.target.value)}
                    placeholder="TX #123456"
                  />
                </Field>
              </div>
            </>
          ) : null}

          <Field label="Notas internas">
            <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newWelcome} onChange={(e) => setNewWelcome(e.target.checked)} />
            Enviar correo de bienvenida con instrucciones de acceso
          </label>
        </div>
      </ConfirmDialog>

      {/* Asignar / renovar */}
      <ConfirmDialog
        open={!!assignTarget}
        onOpenChange={(open) => !open && setAssignTarget(null)}
        title={assignTarget?.activeActivation ? "Renovar plan" : "Asignar plan"}
        description={`${assignTarget?.email ?? ""}. El plan se activa por el período indicado; si ya tiene uno vigente del mismo plan, el nuevo empieza cuando termine el actual. Se levanta una suspensión por vencimiento y el cliente recibe la factura en PDF.`}
        confirmLabel="Activar"
        pending={assignMutation.isPending}
        onConfirm={submitAssign}
      >
        <div className="space-y-3">
          <Field label="Plan">
            <Select value={assignPlanId} onValueChange={setAssignPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un plan" />
              </SelectTrigger>
              <SelectContent>{activePlans.map(planOption)}</SelectContent>
            </Select>
          </Field>
          <Field label="Vigencia (días)" hint="30 = un mes. 0 = sin vencimiento.">
            <Input
              type="number"
              min={0}
              value={assignPeriodDays}
              onChange={(e) => setAssignPeriodDays(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Método de pago">
              <Input
                value={assignPaymentMethod}
                onChange={(e) => setAssignPaymentMethod(e.target.value)}
                placeholder="Transferencia, Nequi…"
              />
            </Field>
            <Field label="Referencia de pago">
              <Input
                value={assignPaymentReference}
                onChange={(e) => setAssignPaymentReference(e.target.value)}
                placeholder="TX #123456"
              />
            </Field>
          </div>
          <Field label="Notas internas">
            <Textarea value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} rows={2} />
          </Field>
        </div>
      </ConfirmDialog>

      {/* Cuenta de cobro */}
      <ConfirmDialog
        open={!!issueTarget}
        onOpenChange={(open) => !open && setIssueTarget(null)}
        title="Emitir cuenta de cobro"
        description={`${issueTarget?.email ?? ""} recibe por correo la cuenta de cobro en PDF. Cuando pague, registrás el pago en Facturas y el plan se activa o renueva por ese período; si ya tiene un período vigente del mismo plan, el nuevo empieza cuando termine el actual.`}
        confirmLabel="Emitir y enviar"
        pending={issueMutation.isPending}
        onConfirm={() => {
          if (!issueTarget || !issuePlanId) {
            toast.error("Selecciona un plan con precio");
            return;
          }
          const days = parseDays(issuePeriodDays, false);
          issueMutation.mutate({
            teamId: issueTarget.team.id,
            userId: issueTarget.userId,
            planId: Number(issuePlanId),
            periodDays: days ?? null,
          });
        }}
      >
        <div className="space-y-3">
          <Field
            label="Plan a cobrar"
            hint={billablePlans.length === 0 ? "Ningún plan tiene precio. Cargalos en Planes." : undefined}
          >
            <Select value={issuePlanId} onValueChange={setIssuePlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un plan con precio" />
              </SelectTrigger>
              <SelectContent>{billablePlans.map(planOption)}</SelectContent>
            </Select>
          </Field>
          <Field label="Período a cobrar (días)">
            <Input
              type="number"
              min={1}
              value={issuePeriodDays}
              onChange={(e) => setIssuePeriodDays(e.target.value)}
            />
          </Field>
        </div>
      </ConfirmDialog>

      {/* Suspender */}
      <ConfirmDialog
        open={!!blockTarget}
        onOpenChange={(open) => !open && setBlockTarget(null)}
        title="Suspender cliente"
        description={`${blockTarget?.email ?? ""} conserva su plan y sus dominios, pero todos sus envíos fallan hasta que lo reactives. El resto del team no se ve afectado.`}
        confirmLabel="Suspender"
        destructive
        pending={blockMutation.isPending}
        onConfirm={() =>
          blockTarget &&
          blockMutation.mutate({
            userId: blockTarget.userId,
            blocked: true,
            reason: blockReason.trim() || null,
          })
        }
      >
        <Field label="Motivo" hint="El cliente lo ve en su panel.">
          <Textarea
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            rows={2}
            placeholder="Ej: Pago pendiente del período de septiembre"
          />
        </Field>
      </ConfirmDialog>
    </AdminPage>
  );
}

function ValidityCell({ activation }: { activation: ClientRow["activeActivation"] }) {
  if (!activation) return <span className="text-muted-foreground">—</span>;
  if (!activation.expiresAt) return <span className="text-sm">Sin vencimiento</span>;
  const left = daysUntil(activation.expiresAt);
  const tone = left <= 1 ? "danger" : left <= 7 ? "warning" : "neutral";
  return (
    <div className="space-y-1">
      <div className="text-sm">Vence {formatDate(activation.expiresAt)}</div>
      <Pill tone={tone}>{left > 0 ? `${left} día${left === 1 ? "" : "s"}` : "Hoy"}</Pill>
    </div>
  );
}
