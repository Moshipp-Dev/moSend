import { env } from "~/env";
import { db } from "../db";
import { getActiveGateway, getGatewayByProvider } from "../payments/gateway-registry";
import { TRPCError } from "@trpc/server";

export async function createCheckoutSessionForTeam(
  teamId: number,
  planId: number,
) {
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error("Team not found");

  const plan = await db.pricingPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Plan not found");

  if (plan.isEnterprise) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Este plan requiere contacto con ventas. Escríbenos para activarlo.",
    });
  }

  if (team.pricingPlanId === planId && team.isActive) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ya tienes este plan activo",
    });
  }

  const gateway = await getActiveGateway();

  const successUrl = `${env.NEXTAUTH_URL}/settings/billing?success=true&planId=${planId}`;
  const cancelUrl = `${env.NEXTAUTH_URL}/settings/billing`;

  return gateway.createCheckoutSession({
    teamId,
    planId,
    successUrl,
    cancelUrl,
  });
}

export async function getManageSessionUrl(teamId: number) {
  const gateway = await getActiveGateway();
  const url = await gateway.createManageSessionUrl(teamId);
  if (!url) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "La pasarela activa no expone portal de gestión. Contacta al administrador.",
    });
  }
  return url;
}

export async function syncStripeData(customerId: string) {
  const stripe = await getGatewayByProvider("STRIPE");
  if (!stripe) return;
  // Legacy entry point preserved for the existing webhook route; delegates to
  // the Stripe gateway's webhook-free sync path by simulating a subscription
  // event. Real sync now happens inside StripeGateway.handleWebhook.
  const headers = new Headers();
  const body = JSON.stringify({ customer: customerId });
  await stripe.handleWebhook(headers, body);
}
