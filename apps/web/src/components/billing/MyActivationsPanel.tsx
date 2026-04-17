"use client";

import Link from "next/link";
import { Card } from "@usesend/ui/src/card";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { format } from "date-fns";
import { api } from "~/trpc/react";

export function MyActivationsPanel() {
  const utils = api.useUtils();
  const { data: requests, isLoading } = api.planActivation.listMine.useQuery();
  const cancel = api.planActivation.cancel.useMutation({
    onSuccess: async () => {
      toast.success("Solicitud cancelada");
      await utils.planActivation.listMine.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <Spinner />
      </Card>
    );
  }

  if (!requests || requests.length === 0) return null;

  const pending = requests.filter((r) => r.status === "PENDING");
  const recent = requests.slice(0, 5);

  return (
    <Card className="space-y-3 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Solicitudes de activación</h3>
        {pending.length > 0 && (
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100">
            {pending.length} pendiente{pending.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="py-2">Fecha</th>
            <th className="py-2">Plan</th>
            <th className="py-2">Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {recent.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="py-2 text-xs">
                {format(new Date(r.createdAt), "yyyy-MM-dd HH:mm")}
              </td>
              <td className="py-2">{r.plan.name}</td>
              <td className="py-2">
                <span className="text-xs">{translateStatus(r.status)}</span>
                {r.status === "REJECTED" && r.rejectionReason && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.rejectionReason}
                  </div>
                )}
              </td>
              <td className="py-2 text-right">
                <Link
                  href={`/billing/activation-pending/${r.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  Ver
                </Link>
                {r.status === "PENDING" && (
                  <button
                    onClick={() => cancel.mutate({ requestId: r.id })}
                    className="ml-3 text-xs text-destructive hover:underline"
                    disabled={cancel.isPending}
                  >
                    Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function translateStatus(status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED") {
  return {
    PENDING: "Pendiente",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
    CANCELLED: "Cancelada",
  }[status];
}
