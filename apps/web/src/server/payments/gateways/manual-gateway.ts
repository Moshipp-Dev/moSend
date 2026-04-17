import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
  TestResult,
  WebhookResult,
} from "../gateway";
import { PlanActivationService } from "~/server/service/plan-activation-service";
import { env } from "~/env";

// Manual flow: no external payment processor. The gateway registers an
// activation request that the admin will approve after confirming payment
// out-of-band (bank transfer, dLocal Go Pay Link sent by WhatsApp, Nequi, etc.).
export class ManualGateway implements PaymentGateway {
  readonly provider = "MANUAL" as const;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async createCheckoutSession(p: CheckoutParams & { requestedByUserId?: number }): Promise<CheckoutResult> {
    if (!p.requestedByUserId) {
      throw new Error(
        "ManualGateway.createCheckoutSession requires requestedByUserId",
      );
    }
    const request = await PlanActivationService.createRequest({
      teamId: p.teamId,
      planId: p.planId,
      requestedByUserId: p.requestedByUserId,
    });

    return {
      url: `${env.NEXTAUTH_URL}/billing/activation-pending/${request.id}`,
      externalId: request.id,
    };
  }

  async createManageSessionUrl(): Promise<string | null> {
    return null;
  }

  async handleWebhook(): Promise<WebhookResult> {
    return { ok: true, message: "Manual gateway has no webhooks" };
  }

  async testConnection(): Promise<TestResult> {
    return { ok: true };
  }
}
