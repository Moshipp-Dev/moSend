"use client";

import { useState } from "react";
import { Card } from "@usesend/ui/src/card";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { format } from "date-fns";
import { api } from "~/trpc/react";

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

function openPdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Cuentas de cobro y facturas del cliente, con descarga del PDF.
export function MyInvoicesPanel() {
  const { data: invoices, isLoading } = api.invoice.listMine.useQuery();
  const utils = api.useUtils();
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (id: string) => {
    setDownloading(id);
    try {
      const file = await utils.invoice.pdf.fetch({ id });
      openPdf(file.base64, file.filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar");
    } finally {
      setDownloading(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <Spinner />
      </Card>
    );
  }

  if (!invoices || invoices.length === 0) return null;

  const pending = invoices.filter((i) => i.status === "ISSUED");

  return (
    <Card className="space-y-3 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Facturas y cuentas de cobro</h3>
        {pending.length > 0 && (
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100">
            {pending.length} pendiente{pending.length === 1 ? "" : "s"} de pago
          </span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="py-2">Número</th>
            <th className="py-2">Concepto</th>
            <th className="py-2">Valor</th>
            <th className="py-2">Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id} className="border-t align-top">
              <td className="py-2 text-xs">
                <div className="font-mono">{i.number}</div>
                <div className="text-muted-foreground">
                  {format(new Date(i.issuedAt), "yyyy-MM-dd")}
                </div>
              </td>
              <td className="py-2 text-xs">{i.description}</td>
              <td className="py-2 text-xs">{formatMoney(i.amount, i.currency)}</td>
              <td className="py-2 text-xs">
                {i.status === "PAID" ? (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-green-900 dark:bg-green-900/30 dark:text-green-100">
                    Pagada{i.paidAt ? ` ${format(new Date(i.paidAt), "yyyy-MM-dd")}` : ""}
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
              </td>
              <td className="py-2 text-right">
                <button
                  onClick={() => download(i.id)}
                  disabled={downloading === i.id}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {downloading === i.id ? "Generando…" : "Descargar PDF"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
