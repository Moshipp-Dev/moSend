"use client";

import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Switch } from "@usesend/ui/src/switch";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { api } from "~/trpc/react";
import type { GatewayProvider } from "@prisma/client";

type GatewayRow = {
  id: number;
  provider: GatewayProvider;
  isActive: boolean;
  isDefault: boolean;
  hasCredentials: boolean;
  settings: unknown;
  lastTestedAt: Date | null;
  lastError: string | null;
};

export default function AdminGatewaysPage() {
  const utils = api.useUtils();
  const { data: gateways, isLoading } = api.adminGateways.list.useQuery();

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Pasarelas de pago</h2>
      <p className="text-sm text-muted-foreground">
        Activa, configura y selecciona la pasarela default. Las credenciales se
        almacenan cifradas con AES-256-GCM.
      </p>

      <div className="space-y-4">
        {gateways?.map((g) => (
          <GatewayCard
            key={g.provider}
            gateway={g as GatewayRow}
            onChanged={() => utils.adminGateways.list.invalidate()}
          />
        ))}
      </div>
    </div>
  );
}

function GatewayCard({
  gateway,
  onChanged,
}: {
  gateway: GatewayRow;
  onChanged: () => void;
}) {
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [dlocalKey, setDlocalKey] = useState("");
  const [dlocalSecret, setDlocalSecret] = useState("");
  const [dlocalEnv, setDlocalEnv] = useState<"sandbox" | "live">("sandbox");

  const updateMutation = api.adminGateways.update.useMutation({
    onSuccess: () => {
      toast.success("Pasarela actualizada");
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const setDefaultMutation = api.adminGateways.setDefault.useMutation({
    onSuccess: () => {
      toast.success("Pasarela establecida como default");
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const testMutation = api.adminGateways.test.useMutation({
    onSuccess: (res) => {
      if (res.ok) toast.success("Conexión OK");
      else toast.error(res.error ?? "falló");
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const title = {
    MANUAL: "Manual (sin cobro automático)",
    STRIPE: "Stripe",
    DLOCALGO: "dLocal Go",
  }[gateway.provider];

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {gateway.hasCredentials
              ? "Credenciales guardadas"
              : "Sin credenciales"}
            {gateway.lastTestedAt
              ? ` · Última prueba ${new Date(gateway.lastTestedAt).toLocaleString()}`
              : ""}
          </p>
          {gateway.lastError && (
            <p className="mt-1 text-xs text-destructive">
              Último error: {gateway.lastError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {gateway.isDefault && (
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              default
            </span>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={gateway.isActive}
              onCheckedChange={(checked) =>
                updateMutation.mutate({
                  provider: gateway.provider,
                  isActive: checked,
                })
              }
            />
            Activa
          </label>
        </div>
      </div>

      {gateway.provider === "STRIPE" && (
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="STRIPE_SECRET_KEY (sk_...)"
            value={stripeSecret}
            onChange={(e) => setStripeSecret(e.target.value)}
          />
          <Input
            type="password"
            placeholder="STRIPE_WEBHOOK_SECRET (whsec_...)"
            value={stripeWebhook}
            onChange={(e) => setStripeWebhook(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!stripeSecret.trim()}
            onClick={() => {
              updateMutation.mutate({
                provider: "STRIPE",
                credentials: {
                  secretKey: stripeSecret,
                  webhookSecret: stripeWebhook || undefined,
                },
              });
              setStripeSecret("");
              setStripeWebhook("");
            }}
          >
            Guardar credenciales
          </Button>
        </div>
      )}

      {gateway.provider === "DLOCALGO" && (
        <div className="space-y-2">
          <Input
            placeholder="API key"
            value={dlocalKey}
            onChange={(e) => setDlocalKey(e.target.value)}
          />
          <Input
            type="password"
            placeholder="API secret"
            value={dlocalSecret}
            onChange={(e) => setDlocalSecret(e.target.value)}
          />
          <select
            value={dlocalEnv}
            onChange={(e) => setDlocalEnv(e.target.value as "sandbox" | "live")}
            className="rounded border bg-background px-2 py-1 text-sm"
          >
            <option value="sandbox">sandbox</option>
            <option value="live">live</option>
          </select>
          <div>
            <Button
              size="sm"
              disabled={!dlocalKey.trim() || !dlocalSecret.trim()}
              onClick={() => {
                updateMutation.mutate({
                  provider: "DLOCALGO",
                  credentials: {
                    apiKey: dlocalKey,
                    apiSecret: dlocalSecret,
                    environment: dlocalEnv,
                  },
                });
                setDlocalKey("");
                setDlocalSecret("");
              }}
            >
              Guardar credenciales
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Implementación pendiente: la integración real se realiza cuando
            agregues la conexión con la API de dLocal Go.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!gateway.isActive || gateway.isDefault}
          onClick={() => setDefaultMutation.mutate({ provider: gateway.provider })}
        >
          Marcar como default
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => testMutation.mutate({ provider: gateway.provider })}
          disabled={testMutation.isPending}
        >
          Probar conexión
        </Button>
        {gateway.hasCredentials && gateway.provider !== "MANUAL" && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              updateMutation.mutate({
                provider: gateway.provider,
                credentials: null,
              })
            }
          >
            Borrar credenciales
          </Button>
        )}
      </div>
    </div>
  );
}
