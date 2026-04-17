"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Textarea } from "@usesend/ui/src/textarea";
import { Switch } from "@usesend/ui/src/switch";
import { toast } from "@usesend/ui/src/toaster";
import { api } from "~/trpc/react";
import type { PricingPlan } from "@prisma/client";

type Mode = "create" | "edit";

interface PlanFormProps {
  mode: Mode;
  plan?: PricingPlan;
}

interface FormState {
  key: string;
  name: string;
  description: string;
  emailsPerMonth: string;
  emailsPerDay: string;
  maxDomains: string;
  maxContactBooks: string;
  maxTeamMembers: string;
  maxWebhooks: string;
  priceMonthly: string;
  currency: string;
  perksText: string;
  stripePriceId: string;
  dlocalgoPriceId: string;
  isActive: boolean;
  isEnterprise: boolean;
  isPopular: boolean;
  sortOrder: string;
}

function toForm(plan?: PricingPlan): FormState {
  const priceIds = (plan?.gatewayPriceIds as Record<string, string> | null) ?? {};
  return {
    key: plan?.key ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    emailsPerMonth: String(plan?.emailsPerMonth ?? -1),
    emailsPerDay: String(plan?.emailsPerDay ?? -1),
    maxDomains: String(plan?.maxDomains ?? -1),
    maxContactBooks: String(plan?.maxContactBooks ?? -1),
    maxTeamMembers: String(plan?.maxTeamMembers ?? -1),
    maxWebhooks: String(plan?.maxWebhooks ?? -1),
    priceMonthly: plan ? Number(plan.priceMonthly).toString() : "0",
    currency: plan?.currency ?? "USD",
    perksText: (plan?.perks as string[] | null)?.join("\n") ?? "",
    stripePriceId: typeof priceIds.stripe === "string" ? priceIds.stripe : "",
    dlocalgoPriceId:
      typeof priceIds.dlocalgo === "string" ? priceIds.dlocalgo : "",
    isActive: plan?.isActive ?? true,
    isEnterprise: plan?.isEnterprise ?? false,
    isPopular: plan?.isPopular ?? false,
    sortOrder: String(plan?.sortOrder ?? 0),
  };
}

export function PlanForm({ mode, plan }: PlanFormProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [state, setState] = useState<FormState>(toForm(plan));

  const createMutation = api.adminPlans.create.useMutation({
    onSuccess: async () => {
      toast.success("Plan creado");
      await utils.adminPlans.list.invalidate();
      router.push("/admin/plans");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = api.adminPlans.update.useMutation({
    onSuccess: async () => {
      toast.success("Plan actualizado");
      await utils.adminPlans.list.invalidate();
      if (plan) await utils.adminPlans.get.invalidate({ id: plan.id });
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const perks = state.perksText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const gatewayPriceIds: Record<string, string> = {};
    if (state.stripePriceId.trim()) gatewayPriceIds.stripe = state.stripePriceId.trim();
    if (state.dlocalgoPriceId.trim()) gatewayPriceIds.dlocalgo = state.dlocalgoPriceId.trim();

    const payload = {
      key: state.key.trim(),
      name: state.name.trim(),
      description: state.description.trim() || null,
      emailsPerMonth: parseInt(state.emailsPerMonth, 10),
      emailsPerDay: parseInt(state.emailsPerDay, 10),
      maxDomains: parseInt(state.maxDomains, 10),
      maxContactBooks: parseInt(state.maxContactBooks, 10),
      maxTeamMembers: parseInt(state.maxTeamMembers, 10),
      maxWebhooks: parseInt(state.maxWebhooks, 10),
      priceMonthly: parseFloat(state.priceMonthly),
      currency: state.currency.trim().toUpperCase(),
      gatewayPriceIds,
      perks,
      isActive: state.isActive,
      isEnterprise: state.isEnterprise,
      isPopular: state.isPopular,
      sortOrder: parseInt(state.sortOrder, 10),
    };

    if (mode === "create") {
      createMutation.mutate(payload);
    } else if (plan) {
      updateMutation.mutate({ id: plan.id, data: payload });
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Clave (único, minúscula)">
          <Input
            value={state.key}
            onChange={(e) => setState({ ...state, key: e.target.value })}
            disabled={mode === "edit"}
            required
          />
        </FormField>
        <FormField label="Nombre para mostrar">
          <Input
            value={state.name}
            onChange={(e) => setState({ ...state, name: e.target.value })}
            required
          />
        </FormField>
      </div>

      <FormField label="Descripción">
        <Textarea
          value={state.description}
          onChange={(e) => setState({ ...state, description: e.target.value })}
          rows={2}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FormField label="Precio mensual">
          <Input
            type="number"
            step="0.01"
            value={state.priceMonthly}
            onChange={(e) => setState({ ...state, priceMonthly: e.target.value })}
          />
        </FormField>
        <FormField label="Moneda">
          <Input
            value={state.currency}
            onChange={(e) => setState({ ...state, currency: e.target.value })}
            maxLength={3}
          />
        </FormField>
        <FormField label="Orden">
          <Input
            type="number"
            value={state.sortOrder}
            onChange={(e) => setState({ ...state, sortOrder: e.target.value })}
          />
        </FormField>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          Límites (-1 = ilimitado)
        </h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <NumberField
            label="Emails / mes"
            value={state.emailsPerMonth}
            onChange={(v) => setState({ ...state, emailsPerMonth: v })}
          />
          <NumberField
            label="Emails / día"
            value={state.emailsPerDay}
            onChange={(v) => setState({ ...state, emailsPerDay: v })}
          />
          <NumberField
            label="Dominios"
            value={state.maxDomains}
            onChange={(v) => setState({ ...state, maxDomains: v })}
          />
          <NumberField
            label="Libretas contactos"
            value={state.maxContactBooks}
            onChange={(v) => setState({ ...state, maxContactBooks: v })}
          />
          <NumberField
            label="Miembros equipo"
            value={state.maxTeamMembers}
            onChange={(v) => setState({ ...state, maxTeamMembers: v })}
          />
          <NumberField
            label="Webhooks"
            value={state.maxWebhooks}
            onChange={(v) => setState({ ...state, maxWebhooks: v })}
          />
        </div>
      </div>

      <FormField label="Perks (un bullet por línea)">
        <Textarea
          value={state.perksText}
          onChange={(e) => setState({ ...state, perksText: e.target.value })}
          rows={5}
          placeholder={"Envía hasta 50,000 correos\nSoporte prioritario\nAPI REST + SMTP"}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Stripe priceId">
          <Input
            value={state.stripePriceId}
            onChange={(e) => setState({ ...state, stripePriceId: e.target.value })}
            placeholder="price_xxx"
          />
        </FormField>
        <FormField label="dLocal Go planId">
          <Input
            value={state.dlocalgoPriceId}
            onChange={(e) => setState({ ...state, dlocalgoPriceId: e.target.value })}
            placeholder="plan_xxx"
          />
        </FormField>
      </div>

      <div className="flex items-center gap-6">
        <ToggleField
          label="Activo"
          checked={state.isActive}
          onChange={(v) => setState({ ...state, isActive: v })}
        />
        <ToggleField
          label="Enterprise (contacto)"
          checked={state.isEnterprise}
          onChange={(v) => setState({ ...state, isEnterprise: v })}
        />
        <ToggleField
          label="Popular"
          checked={state.isPopular}
          onChange={(v) => setState({ ...state, isPopular: v })}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isBusy}>
          {mode === "create" ? "Crear plan" : "Guardar cambios"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/plans")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FormField label={label}>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
