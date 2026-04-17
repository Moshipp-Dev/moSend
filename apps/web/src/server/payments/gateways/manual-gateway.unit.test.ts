import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateRequest } = vi.hoisted(() => ({
  mockCreateRequest: vi.fn(),
}));

vi.mock("~/server/service/plan-activation-service", () => ({
  PlanActivationService: {
    createRequest: mockCreateRequest,
  },
}));

vi.mock("~/env", () => ({
  env: {
    NEXTAUTH_URL: "https://app.example.com",
  },
}));

import { ManualGateway } from "~/server/payments/gateways/manual-gateway";

describe("ManualGateway", () => {
  const gateway = new ManualGateway();

  beforeEach(() => {
    mockCreateRequest.mockReset();
  });

  it("is always configured", async () => {
    expect(await gateway.isConfigured()).toBe(true);
  });

  it("creates a PlanActivationRequest and returns the pending URL", async () => {
    mockCreateRequest.mockResolvedValue({ id: "req_abc" });

    const result = await gateway.createCheckoutSession({
      teamId: 42,
      planId: 5,
      requestedByUserId: 7,
      successUrl: "ignored",
      cancelUrl: "ignored",
    });

    expect(mockCreateRequest).toHaveBeenCalledWith({
      teamId: 42,
      planId: 5,
      requestedByUserId: 7,
    });
    expect(result.url).toBe(
      "https://app.example.com/billing/activation-pending/req_abc",
    );
    expect(result.externalId).toBe("req_abc");
  });

  it("throws when requestedByUserId is missing", async () => {
    await expect(
      gateway.createCheckoutSession({
        teamId: 1,
        planId: 1,
        successUrl: "",
        cancelUrl: "",
      }),
    ).rejects.toThrow(/requestedByUserId/);
  });

  it("returns null for manage session", async () => {
    expect(await gateway.createManageSessionUrl()).toBeNull();
  });

  it("accepts webhooks as no-op", async () => {
    const result = await gateway.handleWebhook();
    expect(result.ok).toBe(true);
  });

  it("testConnection always returns ok", async () => {
    expect(await gateway.testConnection()).toEqual({ ok: true });
  });
});
