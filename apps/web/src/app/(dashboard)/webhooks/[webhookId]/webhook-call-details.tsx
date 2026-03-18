"use client";

import { formatDate } from "date-fns";
import { RefreshCw } from "lucide-react";
import { Button } from "@usesend/ui/src/button";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";
import { WebhookCallStatusBadge } from "../webhook-call-status-badge";
import { WEBHOOK_EVENT_VERSION } from "@usesend/lib/src/webhook/webhook-events";

import { CodeDisplay } from "~/components/code-display";

export function WebhookCallDetails({ callId }: { callId: string }) {
  const callQuery = api.webhook.getCall.useQuery({ id: callId });
  const retryMutation = api.webhook.retryCall.useMutation();
  const utils = api.useUtils();

  const call = callQuery.data;

  if (!call) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex flex-row items-center justify-between mb-4">
          <h2 className="text-base font-medium">Detalles de la llamada</h2>
        </div>
        <div className="flex-1 rounded-xl border shadow p-6 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">
            Cargando detalles de la llamada...
          </p>
        </div>
      </div>
    );
  }

  const handleRetry = () => {
    retryMutation.mutate(
      { id: call.id },
      {
        onSuccess: async () => {
          await utils.webhook.listCalls.invalidate();
          await utils.webhook.getCall.invalidate();
          toast.success("Llamada de webhook en cola para reintento");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  // Reconstruct the full payload that was actually sent to the webhook endpoint
  const buildFullPayload = () => {
    let data: unknown;
    try {
      data = JSON.parse(call.payload);
    } catch {
      data = call.payload;
    }

    return {
      id: call.id,
      type: call.type,
      version: call.webhook?.apiVersion ?? WEBHOOK_EVENT_VERSION,
      createdAt: new Date(call.createdAt).toISOString(),
      teamId: call.teamId,
      data,
      attempt: call.attempt,
    };
  };

  const fullPayload = buildFullPayload();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-row items-center justify-between mb-4">
        <h2 className="text-base font-medium">Detalles de la llamada</h2>
        {call.status === "FAILED" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={retryMutation.isPending}
            className="h-8"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Reintentar
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded-xl border shadow p-6 space-y-8 no-scrollbar">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Estado
            </span>
            <div>
              <WebhookCallStatusBadge status={call.status} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Tipo de evento
            </span>
            <span className="text-sm font-mono">{call.type}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Fecha y hora
            </span>
            <span className="text-sm font-mono">
              {formatDate(call.createdAt, "MMM dd, yyyy HH:mm:ss")}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Intento
            </span>
            <span className="text-sm font-mono">{call.attempt}</span>
          </div>

          {call.responseStatus && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Estado de respuesta
              </span>
              <span className="text-sm font-mono">{call.responseStatus}</span>
            </div>
          )}

          {call.responseTimeMs != null && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Duración
              </span>
              <span className="text-sm font-mono">{call.responseTimeMs}ms</span>
            </div>
          )}
        </div>

        {call.lastError && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider text-red-500">
              Error
            </span>
            <div className="text-xs bg-red-500/10 border border-red-500/20 rounded-md p-3 font-mono text-red-600 dark:text-red-400">
              {call.lastError}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h4 className="font-medium text-sm">Carga útil de la solicitud</h4>
          <CodeDisplay
            code={JSON.stringify(fullPayload, null, 2)}
            language="json"
          />
        </div>

        {call.responseText && (
          <>
            <div className="flex flex-col gap-3">
              <h4 className="font-medium text-sm">Cuerpo de la respuesta</h4>
              <CodeDisplay code={call.responseText} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
