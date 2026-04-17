import Stripe from "stripe";
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
  TestResult,
  WebhookResult,
} from "../gateway";
import { env } from "~/env";
import { db } from "~/server/db";
import { TeamService } from "~/server/service/team-service";
import { sendSubscriptionConfirmationEmail } from "~/server/mailer";
import { logger } from "~/server/logger/log";

export interface StripeCredentials {
  secretKey: string;
  webhookSecret?: string;
}

export class StripeGateway implements PaymentGateway {
  readonly provider = "STRIPE" as const;
  private client: Stripe | null = null;

  constructor(private readonly credentials?: StripeCredentials) {}

  private getClient(): Stripe {
    if (this.client) return this.client;
    const secret = this.credentials?.secretKey ?? env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error("Stripe secret key not configured");
    this.client = new Stripe(secret);
    return this.client;
  }

  async isConfigured(): Promise<boolean> {
    return Boolean(this.credentials?.secretKey ?? env.STRIPE_SECRET_KEY);
  }

  async createCheckoutSession(p: CheckoutParams): Promise<CheckoutResult> {
    const plan = await db.pricingPlan.findUnique({ where: { id: p.planId } });
    if (!plan) throw new Error(`PricingPlan ${p.planId} not found`);
    if (plan.isEnterprise) {
      throw new Error(
        "Enterprise plans require a sales conversation — self-checkout disabled",
      );
    }

    const gatewayPriceIds = plan.gatewayPriceIds as Record<string, string | string[]>;
    const stripeIds = gatewayPriceIds.stripe;
    const priceIds = Array.isArray(stripeIds) ? stripeIds : stripeIds ? [stripeIds] : [];

    if (priceIds.length === 0) {
      throw new Error(
        `Plan "${plan.key}" has no Stripe priceId configured in gatewayPriceIds.stripe`,
      );
    }

    const team = await db.team.findUnique({ where: { id: p.teamId } });
    if (!team) throw new Error("Team not found");

    let customerId = team.stripeCustomerId;
    const stripe = this.getClient();

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { teamId: p.teamId },
      });
      await TeamService.updateTeam(p.teamId, {
        billingEmail: customer.email,
        stripeCustomerId: customer.id,
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: priceIds.map((price) => ({ price, quantity: 1 })),
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      metadata: { teamId: p.teamId, planId: p.planId },
      client_reference_id: p.teamId.toString(),
    });

    if (!session.url) throw new Error("Stripe session returned no URL");
    return { url: session.url, externalId: session.id };
  }

  async createManageSessionUrl(teamId: number): Promise<string | null> {
    const team = await db.team.findUnique({ where: { id: teamId } });
    if (!team?.stripeCustomerId) return null;

    const stripe = this.getClient();
    const portal = await stripe.billingPortal.sessions.create({
      customer: team.stripeCustomerId,
      return_url: env.NEXTAUTH_URL,
    });
    return portal.url;
  }

  async handleWebhook(headers: Headers, body: string): Promise<WebhookResult> {
    const signature = headers.get("stripe-signature");
    const webhookSecret =
      this.credentials?.webhookSecret ?? env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      return { ok: false, message: "missing signature or webhook secret" };
    }

    const stripe = this.getClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      logger.warn({ err }, "[StripeGateway] Invalid webhook signature");
      return { ok: false, message: "invalid signature" };
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "checkout.session.completed"
    ) {
      const customerId =
        (event.data.object as { customer?: string }).customer ?? "";
      if (customerId) {
        await syncStripeDataForCustomer(this.getClient(), customerId);
      }
    }

    return { ok: true };
  }

  async testConnection(): Promise<TestResult> {
    try {
      await this.getClient().accounts.retrieve();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

async function syncStripeDataForCustomer(stripe: Stripe, customerId: string) {
  const team = await db.team.findUnique({
    where: { stripeCustomerId: customerId },
  });
  if (!team) return;

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 1,
    status: "all",
    expand: ["data.default_payment_method"],
  });

  const subscription = subscriptions.data[0];
  if (!subscription?.items.data[0]) return;

  const priceIds = subscription.items.data
    .map((item) => item.price?.id)
    .filter((id): id is string => Boolean(id));

  const nextPricingPlan = await resolvePlanFromStripePriceIds(priceIds);
  const wasPaid = team.isActive && team.plan !== "FREE";
  const isNowPaid =
    subscription.status === "active" && nextPricingPlan?.key !== "free";

  await db.subscription.upsert({
    where: { id: subscription.id },
    update: {
      status: subscription.status,
      priceId: subscription.items.data[0]?.price?.id || "",
      priceIds,
      currentPeriodEnd: new Date(
        subscription.items.data[0]?.current_period_end * 1000,
      ),
      currentPeriodStart: new Date(
        subscription.items.data[0]?.current_period_start * 1000,
      ),
      cancelAtPeriodEnd: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null,
      paymentMethod: JSON.stringify(subscription.default_payment_method),
      teamId: team.id,
    },
    create: {
      id: subscription.id,
      status: subscription.status,
      priceId: subscription.items.data[0]?.price?.id || "",
      priceIds,
      currentPeriodEnd: new Date(
        subscription.items.data[0]?.current_period_end * 1000,
      ),
      currentPeriodStart: new Date(
        subscription.items.data[0]?.current_period_start * 1000,
      ),
      cancelAtPeriodEnd: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null,
      paymentMethod: JSON.stringify(subscription.default_payment_method),
      teamId: team.id,
    },
  });

  const nextLegacy =
    subscription.status === "canceled" || nextPricingPlan?.key === "free"
      ? "FREE"
      : "BASIC";

  await TeamService.updateTeam(team.id, {
    plan: nextLegacy,
    pricingPlan: nextPricingPlan
      ? { connect: { id: nextPricingPlan.id } }
      : { disconnect: true },
    isActive: subscription.status === "active",
  });

  if (!wasPaid && isNowPaid) {
    try {
      const teamUsers = await TeamService.getTeamUsers(team.id);
      await Promise.all(
        teamUsers
          .map((tu) => tu.user?.email)
          .filter((email): email is string => Boolean(email))
          .map((email) => sendSubscriptionConfirmationEmail(email)),
      );
    } catch (err) {
      logger.error(
        { err, teamId: team.id },
        "[StripeGateway]: Failed sending subscription confirmation email",
      );
    }
  }
}

async function resolvePlanFromStripePriceIds(priceIds: string[]) {
  if (priceIds.length === 0) return null;
  const plans = await db.pricingPlan.findMany({ where: { isActive: true } });
  for (const plan of plans) {
    const map = plan.gatewayPriceIds as Record<string, string | string[]>;
    const stripeIds = map.stripe;
    const planPriceIds = Array.isArray(stripeIds)
      ? stripeIds
      : stripeIds
        ? [stripeIds]
        : [];
    if (planPriceIds.some((id) => priceIds.includes(id))) return plan;
  }
  return null;
}
