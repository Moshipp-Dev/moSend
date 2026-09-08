"use client";

import { useState } from "react";
import { PlanInvoiceStatus } from "@prisma/client";
import { Button } from "@usesend/ui/src/button";
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
import { formatDate, formatMoney } from "~/lib/format";
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

type StatusFilter = PlanInvoiceStatus | "ALL";

const COLUMNS = [
  { label: "Número" },
  { label: "Cliente" },
  { label: "Concepto" },
  { label: "Valor", className: "text-right" },
  { label: "Estado" },
  { label: "Acciones", className: "text-right" },
];

// Every cuenta de cobro and factura, with the actions that close the manual
// billing loop: register a payment, void, resend, download.
export default function AdminInvoicesPage() {
  const utils = api.useUtils();
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = api.adminInvoices.list.useQuery({
    status: status === "ALL" ? undefined : status,
    search: search || undefined,
    page,
    pageSize: 25,
  });

  const invalidateAll = async () => {
    await Promise.all([
      utils.adminInvoices.list.invalidate(),
      utils.adminClients.list.invalidate(),
      utils.adminActivations.list.invalidate(),
    ]);
  };

  const [downloading, setDownloading] = useState<string | null>(null);
  const download = async (id: string) => {
    setDownloading(id);
    try {
      const file = await utils.adminInvoices.pdf.fetch({ id });
      savePdf(file.base64, file.filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setDownloading(null);
    }
  };

  const resendMutation = api.adminInvoices.resend.useMutation({
    onSuccess: () => toast.success("Correo reenviado al cliente"),
    onError: (e) => toast.error(e.message),
  });

  const [voidTarget, setVoidTarget] = useState<{ id: string; number: string } | null>(null);
  const voidMutation = api.adminInvoices.void.useMutation({
    onSuccess: async () => {
      toast.success("Cuenta de cobro anulada");
      await invalidateAll();
      setVoidTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [payTarget, setPayTarget] = useState<{
    id: string;
    number: string;
    email: string | null;
  } | null>(null);
  const [payMethod, setPayMethod] = useState("");
  const [payReference, setPayReference] = useState("");
  const payMutation = api.adminInvoices.registerPayment.useMutation({
    onSuccess: async () => {
      toast.success("Pago registrado, plan activado y factura enviada");
      await invalidateAll();
      setPayTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const totals = data?.totals;
  const pendingLabel = totals?.pending.length
    ? totals.pending.map((t) => formatMoney(t.amount, t.currency)).join(" · ")
    : "—";
  const pendingCount = totals?.pending.reduce((acc, t) => acc + t.count, 0) ?? 0;
  const paidLabel = totals?.paidThisMonth.length
    ? totals.paidThisMonth.map((t) => formatMoney(t.amount, t.currency)).join(" · ")
    : "—";
  const paidCount = totals?.paidThisMonth.reduce((acc, t) => acc + t.count, 0) ?? 0;

  return (
    <AdminPage
      title="Facturas"
      description="Las cuentas de cobro se emiten solas antes de cada vencimiento o a mano desde Clientes. Al registrar el pago se activa el plan por el período cobrado y el cliente recibe la factura en PDF."
    >
      <StatGrid className="xl:grid-cols-2">
        <StatTile
          label="Pendiente de cobro"
          value={pendingLabel}
          tone={pendingCount > 0 ? "warning" : "neutral"}
          hint={pendingCount > 0 ? `${pendingCount} cuenta${pendingCount === 1 ? "" : "s"} sin pagar` : "Nada pendiente"}
        />
        <StatTile
          label="Cobrado este mes"
          value={paidLabel}
          tone={paidCount > 0 ? "success" : "neutral"}
          hint={paidCount > 0 ? `${paidCount} factura${paidCount === 1 ? "" : "s"} pagada${paidCount === 1 ? "" : "s"}` : "Sin pagos este mes"}
        />
      </StatGrid>

      <FilterBar>
        <Input
          placeholder="Buscar por número, cliente o plan"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full max-w-sm"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="ISSUED">Pendientes</SelectItem>
            <SelectItem value="PAID">Pagadas</SelectItem>
            <SelectItem value="VOID">Anuladas</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={COLUMNS}
        isLoading={isLoading}
        isEmpty={data?.invoices.length === 0}
        emptyMessage="No hay facturas en este estado."
      >
        {data?.invoices.map((i) => {
          const st = INVOICE_STATUS[i.status];
          return (
            <Row key={i.id}>
              <Cell>
                <CellStack
                  primary={<span className="font-mono text-xs">{i.number}</span>}
                  secondary={formatDate(i.issuedAt)}
                />
              </Cell>
              <Cell>
                <CellStack primary={i.user?.email ?? i.team.name} secondary={i.user?.name} />
              </Cell>
              <Cell className="text-sm text-muted-foreground">{i.description}</Cell>
              <Cell numeric className="font-medium">
                {formatMoney(i.amount, i.currency)}
              </Cell>
              <Cell>
                <div className="space-y-1">
                  <Pill tone={st.tone}>{st.label}</Pill>
                  <div className="text-xs text-muted-foreground">
                    {i.status === "PAID" && i.paidAt
                      ? `Pagada el ${formatDate(i.paidAt)}${i.paymentReference ? ` · ${i.paymentReference}` : ""}`
                      : i.status === "ISSUED" && i.dueAt
                        ? `Vence el ${formatDate(i.dueAt)}`
                        : null}
                  </div>
                </div>
              </Cell>
              <Cell>
                <RowActions>
                  {i.status === "ISSUED" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setPayTarget({ id: i.id, number: i.number, email: i.user?.email ?? null });
                          setPayMethod("");
                          setPayReference("");
                        }}
                      >
                        Registrar pago
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setVoidTarget({ id: i.id, number: i.number })}
                      >
                        Anular
                      </Button>
                    </>
                  ) : null}
                  {i.status !== "VOID" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={resendMutation.isPending}
                      onClick={() => resendMutation.mutate({ id: i.id })}
                    >
                      Reenviar
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={downloading === i.id}
                    onClick={() => download(i.id)}
                  >
                    {downloading === i.id ? "Generando…" : "PDF"}
                  </Button>
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
        open={!!payTarget}
        onOpenChange={(open) => !open && setPayTarget(null)}
        title={`Registrar pago de ${payTarget?.number ?? ""}`}
        description={`Marca la cuenta como pagada, activa o renueva el plan del cliente por el período cobrado y le envía la factura en PDF${payTarget?.email ? ` a ${payTarget.email}` : ""}.`}
        confirmLabel="Registrar pago"
        pending={payMutation.isPending}
        onConfirm={() =>
          payTarget &&
          payMutation.mutate({
            id: payTarget.id,
            paymentMethod: payMethod || null,
            paymentReference: payReference || null,
          })
        }
      >
        <div className="space-y-3">
          <Field label="Método de pago">
            <Input
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              placeholder="Ej: Transferencia Bancolombia, Nequi"
            />
          </Field>
          <Field label="Referencia de pago">
            <Input
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="TX #123456"
            />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={(open) => !open && setVoidTarget(null)}
        title={`Anular ${voidTarget?.number ?? ""}`}
        description="La cuenta de cobro queda anulada y no se puede pagar. El plan del cliente no cambia."
        confirmLabel="Anular"
        destructive
        pending={voidMutation.isPending}
        onConfirm={() => voidTarget && voidMutation.mutate({ id: voidTarget.id })}
      />
    </AdminPage>
  );
}
