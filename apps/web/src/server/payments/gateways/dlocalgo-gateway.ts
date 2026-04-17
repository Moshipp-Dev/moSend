import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
  TestResult,
  WebhookResult,
} from "../gateway";
import { NotImplementedError } from "../gateway";

export interface DlocalGoCredentials {
  apiKey: string;
  apiSecret: string;
  environment: "sandbox" | "live";
}

// Stub implementation. Wire real dLocal Go REST calls here when credentials
// are available. Endpoints reference: https://docs.dlocalgo.com/api-reference
export class DlocalGoGateway implements PaymentGateway {
  readonly provider = "DLOCALGO" as const;

  constructor(private readonly credentials?: DlocalGoCredentials) {}

  async isConfigured(): Promise<boolean> {
    return Boolean(
      this.credentials?.apiKey &&
        this.credentials?.apiSecret &&
        this.credentials?.environment,
    );
  }

  async createCheckoutSession(_p: CheckoutParams): Promise<CheckoutResult> {
    // TODO: POST https://api.dlocalgo.com/v1/payments with subscription params.
    throw new NotImplementedError("dLocal Go createCheckoutSession pending");
  }

  async createManageSessionUrl(_teamId: number): Promise<string | null> {
    // TODO: dLocal Go does not expose a hosted management portal like Stripe;
    // the plan is to build an in-app subscription page. Return null until then.
    return null;
  }

  async handleWebhook(_headers: Headers, _body: string): Promise<WebhookResult> {
    // TODO: verify signature header `X-DLocal-Signature`, parse event, update
    // Subscription + Team.pricingPlanId accordingly.
    throw new NotImplementedError("dLocal Go webhook handler pending");
  }

  async testConnection(): Promise<TestResult> {
    if (!(await this.isConfigured())) {
      return { ok: false, error: "credentials not configured" };
    }
    // TODO: GET https://api.dlocalgo.com/v1/health to verify credentials.
    return { ok: false, error: "not implemented" };
  }
}
