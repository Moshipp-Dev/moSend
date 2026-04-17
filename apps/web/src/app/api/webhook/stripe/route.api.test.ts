import { describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    gatewayResult: { ok: true } as { ok: boolean; message?: string },
    gatewayAvailable: true,
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => {
    const headers = new Headers();
    headers.set("stripe-signature", "test-signature");
    return headers;
  }),
}));

vi.mock("~/server/payments/gateway-registry", () => ({
  getGatewayByProvider: vi.fn(async () =>
    state.gatewayAvailable
      ? { handleWebhook: vi.fn(async () => state.gatewayResult) }
      : null,
  ),
}));

import { POST } from "~/app/api/webhook/stripe/route";

describe("stripe webhook route", () => {
  it("returns 400 when Stripe gateway is not configured", async () => {
    state.gatewayAvailable = false;

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Stripe gateway not configured");
  });

  it("returns 400 when gateway handler rejects the event", async () => {
    state.gatewayAvailable = true;
    state.gatewayResult = { ok: false, message: "invalid signature" };

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("invalid signature");
  });

  it("returns 200 when gateway handler accepts the event", async () => {
    state.gatewayAvailable = true;
    state.gatewayResult = { ok: true };

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("OK");
  });
});
