import type { GatewayProvider } from "@prisma/client";

export interface CheckoutParams {
  teamId: number;
  planId: number;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
  externalId?: string;
}

export interface WebhookResult {
  ok: boolean;
  message?: string;
}

export interface TestResult {
  ok: boolean;
  error?: string;
}

export interface PaymentGateway {
  readonly provider: GatewayProvider;
  isConfigured(): Promise<boolean>;
  createCheckoutSession(p: CheckoutParams): Promise<CheckoutResult>;
  createManageSessionUrl(teamId: number): Promise<string | null>;
  handleWebhook(headers: Headers, body: string): Promise<WebhookResult>;
  testConnection(): Promise<TestResult>;
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}
