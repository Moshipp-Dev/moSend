"use client";

import { useState } from "react";
import { PlanInvoiceStatus } from "@prisma/client";
import { Button } from "@usesend/ui/src/button";
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

type StatusFilter = PlanInvoiceStatus | "ALL";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function savePdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Every cuenta de cobro and factura generated for CLIENT plans, with the
// actions that close the manual billing loop.
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

  const voidMutation = api.adminInvoices.void.useMutation({
    onSuccess: async () => {
      toast.success("Cuenta de cobro anulada");
      await invalidateAll();
      setVoidTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const payMutation = api.adminInvoices.registerPayment.useMutation({
    onSuccess: async () => {
      toast.success("Pago registrado, plan activado y factura enviada");
      await invalidateAll();
      setPayTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [payTarget, setPayTarget] = useState<{ id: string; number: string; email: string | null } | null>(null);
  const [payMethod, setPayMethod] = useState("");
  const [payReference, setPayReference] = useState("");
  const [voidTarget, setVoidTarget] = useState<{ id: string; number: string } | null>(null);

  const totals = data?.totals;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Facturas y cuentas de cobro</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Las cuentas de cobro se emiten solas antes de cada vencimiento o a
        mano desde Clientes. Al registrar el pago se activa el plan por el
        período cobrado y el cliente recibe la factura en PDF.
      </p>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Pendiente de cobro</div>
            {totals.pending.length === 0 ? (
              <div className="text-lg font-semibold">—</div>
            ) : (
              totals.pending.map((t) => (
                <div key={t.currency} className="text-lg font-semibold">
                  {formatMoney(t.amount, t.currency)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {t.count} cuenta{t.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Cobrado este mes</div>
            {totals.paidThisMonth.length === 0 ? (
              <div className="text-lg font-semibold">—</div>
            ) : (
              totals.paidThisMonth.map((t) => (
                <div key={t.currency} className="text-lg font-semibold">
                  {formatMoney(t.amount, t.currency)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {t.count} factura{t.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por número, cliente o plan"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
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
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="ISSUED">Pendientes</SelectItem>
            <SelectItem value="PAID">Pagadas</SelectItem>
            <SelectItem value="VOID">Anuladas</SelectItem>
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
                <th className="py-2">Número</th>
                <th className="py-2">Cliente</th>
                <th className="py-2">Concepto</th>
                <th className="py-2">Valor</th>
                <th className="py-2">Estado</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data?.invoices.map((i) => (
                <tr key={i.id} className="border-t align-top">
                  <td className="py-2 text-xs">
                    <div className="font-mono">{i.number}</div>
                    <div className="text-muted-foreground">
                      {format(new Date(i.issuedAt), "yyyy-MM-dd")}
                    </div>
                  </td>
                  <td className="py-2">
                    <div>{i.user?.email ?? i.team.name}</div>
                    {i.user?.name ? (
                      <div className="text-xs text-muted-foreground">{i.user.name}</div>
                    ) : null}
                  </td>
                  <td className="py-2 text-xs">{i.description}</td>
                  <td className="py-2">{formatMoney(i.amount, i.currency)}</td>
                  <td className="py-2 text-xs">
                    {i.status === "PAID" ? (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-green-900 dark:bg-green-900/30 dark:text-green-100">
                        Pagada{i.paidAt ? ` · ${format(new Date(i.paidAt), "yyyy-MM-dd")}` : ""}
                      </span>
                    ) : i.status === "ISSUED" ? (
                      <span className="rounded-full bg-yellow-100 px-2 py-1 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100">
                        Pendiente{i.dueAt ? ` · vence ${format(new Date(i.dueAt), "yyyy-MM-dd")}` : ""}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                        Anulada
                      </span>
                    )}
                    {i.status === "PAID" && i.paymentReference ? (
                      <div className="mt-1 text-muted-foreground">
                        {i.paymentMethod ? `${i.paymentMethod} · ` : ""}
                        {i.paymentReference}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
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
                          variant="outline"
                          disabled={resendMutation.isPending}
                          onClick={() => resendMutation.mutate({ id: i.id })}
                        >
                          Reenviar
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloading === i.id}
                        onClick={() => download(i.id)}
                      >
                        {downloading === i.id ? "…" : "PDF"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No hay facturas en este estado.
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

      <Dialog open={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago de {payTarget?.number}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Marca la cuenta como pagada, activa o renueva el plan del cliente
            por el período cobrado y le envía la factura en PDF
            {payTarget?.email ? ` a ${payTarget.email}` : ""}.
          </p>
          <div className="space-y-3">
            <label className="block text-sm">
              Método de pago
              <Input
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                placeholder="Ej: Transferencia Bancolombia, Nequi"
              />
            </label>
            <label className="block text-sm">
              Referencia de pago
              <Input
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="TX #123456"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Cancelar
            </Button>
            <Button
              disabled={payMutation.isPending}
              onClick={() =>
                payTarget &&
                payMutation.mutate({
                  id: payTarget.id,
                  paymentMethod: payMethod || null,
                  paymentReference: payReference || null,
                })
              }
            >
              {payMutation.isPending ? <Spinner className="h-4 w-4" /> : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular {voidTarget?.number}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            La cuenta de cobro queda anulada y no se puede pagar. El plan del
            cliente no cambia.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={voidMutation.isPending}
              onClick={() => voidTarget && voidMutation.mutate({ id: voidTarget.id })}
            >
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
