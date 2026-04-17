import { describe, expect, it } from "vitest";
import { DlocalGoGateway } from "~/server/payments/gateways/dlocalgo-gateway";
import { NotImplementedError } from "~/server/payments/gateway";

describe("DlocalGoGateway", () => {
  it("reports unconfigured without credentials", async () => {
    const gw = new DlocalGoGateway();
    expect(await gw.isConfigured()).toBe(false);
  });

  it("reports configured with a full credential set", async () => {
    const gw = new DlocalGoGateway({
      apiKey: "k",
      apiSecret: "s",
      environment: "sandbox",
    });
    expect(await gw.isConfigured()).toBe(true);
  });

  it("throws NotImplementedError on createCheckoutSession", async () => {
    const gw = new DlocalGoGateway();
    await expect(
      gw.createCheckoutSession({
        teamId: 1,
        planId: 1,
        successUrl: "",
        cancelUrl: "",
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("throws NotImplementedError on handleWebhook", async () => {
    const gw = new DlocalGoGateway();
    await expect(gw.handleWebhook(new Headers(), "")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("testConnection returns error when unconfigured", async () => {
    const gw = new DlocalGoGateway();
    const result = await gw.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("testConnection returns not-implemented when configured", async () => {
    const gw = new DlocalGoGateway({
      apiKey: "k",
      apiSecret: "s",
      environment: "sandbox",
    });
    const result = await gw.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not implemented");
  });

  it("createManageSessionUrl always returns null", async () => {
    const gw = new DlocalGoGateway();
    expect(await gw.createManageSessionUrl(1)).toBeNull();
  });
});
