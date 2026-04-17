import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockRedis } = vi.hoisted(() => ({
  mockDb: {
    team: { findUnique: vi.fn() },
    pricingPlan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockRedis: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (k: string) => k,
  withCache: async (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
}));

import { PlanService } from "~/server/service/plan-service";

describe("PlanService", () => {
  beforeEach(() => {
    mockDb.team.findUnique.mockReset();
    mockDb.pricingPlan.findUnique.mockReset();
    mockDb.pricingPlan.findMany.mockReset();
    mockRedis.get.mockReset();
    mockRedis.setex.mockReset();
    mockRedis.del.mockReset();
    mockRedis.keys.mockReset();
  });

  it("returns the assigned pricingPlan when active", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      pricingPlanId: 7,
      isActive: true,
      plan: "BASIC",
    });
    mockDb.pricingPlan.findUnique.mockResolvedValue({
      id: 7,
      key: "orbita",
      isActive: true,
      name: "Órbita",
    });

    const plan = await PlanService.getPlanForTeam(42);
    expect(plan?.key).toBe("orbita");
  });

  it("falls back to FREE when team is inactive", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      pricingPlanId: 7,
      isActive: false,
      plan: "BASIC",
    });
    mockDb.pricingPlan.findUnique.mockResolvedValue({
      id: 1,
      key: "free",
      isActive: true,
    });

    const plan = await PlanService.getPlanForTeam(42);
    expect(plan?.key).toBe("free");
  });

  it("falls back by legacy enum when pricingPlanId is null", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      pricingPlanId: null,
      isActive: true,
      plan: "BASIC",
    });
    mockDb.pricingPlan.findUnique.mockResolvedValue({
      id: 5,
      key: "orbita",
      isActive: true,
    });

    const plan = await PlanService.getPlanForTeam(42);
    expect(plan?.key).toBe("orbita");
  });

  it("returns null when team not found", async () => {
    mockDb.team.findUnique.mockResolvedValue(null);
    expect(await PlanService.getPlanForTeam(99)).toBeNull();
  });

  it("getPublicPlans filters out the 'free' key", async () => {
    mockDb.pricingPlan.findMany.mockResolvedValue([
      { id: 1, key: "free", isActive: true, sortOrder: 0 },
      { id: 2, key: "chispa", isActive: true, sortOrder: 1 },
      { id: 3, key: "orbita", isActive: true, sortOrder: 2 },
    ]);
    const plans = await PlanService.getPublicPlans();
    expect(plans.map((p) => p.key)).toEqual(["chispa", "orbita"]);
  });

  it("getLimitsForTeam returns FREE fallback when no plan found", async () => {
    mockDb.team.findUnique.mockResolvedValue(null);
    const limits = await PlanService.getLimitsForTeam(99);
    expect(limits.emailsPerMonth).toBe(3000);
    expect(limits.maxDomains).toBe(1);
  });
});
