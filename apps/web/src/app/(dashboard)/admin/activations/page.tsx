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

  const approveMutation = api.adminActivations.approve.useMutation({
    onSuccess: async () => {
      toast.success("Plan activado");
      await utils.adminActivations.list.invalidate();
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = api.adminActivations.reject.useMutation({
    onSuccess: async () => {
      toast.success("Solicitud rechazada");
      await utils.adminActivations.list.invalidate();
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
  };

  const submitAction = () => {
    if (!actionRequestId) return;
    if (actionMode === "approve") {
      approveMutation.mutate({
        requestId: actionRequestId,
        paymentReference: paymentReference || null,
        adminNotes: adminNotes || null,
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Solicitudes de activación</h2>
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
            <SelectItem value="REJECTED">Rechazadas</SelectItem>
            <SelectItem value="CANCELLED">Canceladas</SelectItem>
            <SelectItem value="ALL">Todas</SelectItem>
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
                <th className="py-2">Fecha</th>
                <th className="py-2">Team</th>
                <th className="py-2">Billing email</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Método</th>
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
                    <div className="font-medium">{r.team.name}</div>
                    <div className="text-xs text-muted-foreground">#{r.team.id}</div>
                  </td>
                  <td className="py-2 text-xs">{r.team.billingEmail ?? "—"}</td>
                  <td className="py-2">{r.plan.name}</td>
                  <td className="py-2 text-xs">{r.paymentMethod ?? "—"}</td>
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
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
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
                Al aprobar, el plan se asigna inmediatamente al team y queda activo.
                Opcional: guarda el comprobante del pago.
              </p>
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
                Motivo del rechazo (se muestra al usuario)
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

function StatusBadge({ status }: { status: PlanActivationStatus }) {
  const styles = {
    PENDING: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100",
    APPROVED: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-100",
    REJECTED: "bg-destructive/10 text-destructive",
    CANCELLED: "bg-muted text-muted-foreground",
  } as const;
  const labels = {
    PENDING: "Pendiente",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
    CANCELLED: "Cancelada",
  } as const;
  return (
    <span className={`rounded-full px-2 py-1 text-xs ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
