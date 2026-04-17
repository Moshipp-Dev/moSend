import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTeamService, mockPlanService } = vi.hoisted(() => ({
  mockDb: {
    pricingPlan: { findUnique: vi.fn() },
    team: { findUnique: vi.fn(), update: vi.fn() },
    planActivationRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any[]) => {
      const results: any[] = [];
      for (const op of ops) results.push(await op);
      return results;
    }),
  },
  mockTeamService: {
    refreshTeamCache: vi.fn(),
  },
  mockPlanService: {
    invalidateTeam: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/service/team-service", () => ({ TeamService: mockTeamService }));
vi.mock("~/server/service/plan-service", () => ({ PlanService: mockPlanService }));

import { PlanActivationService } from "~/server/service/plan-activation-service";

describe("PlanActivationService", () => {
  beforeEach(() => {
    Object.values(mockDb.pricingPlan).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.team).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.planActivationRequest).forEach((f) => (f as any).mockReset());
    mockTeamService.refreshTeamCache.mockReset();
    mockPlanService.invalidateTeam.mockReset();
  });

  describe("createRequest", () => {
    it("creates a PENDING request when inputs are valid", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        isActive: true,
        isEnterprise: false,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.planActivationRequest.findFirst.mockResolvedValue(null);
      mockDb.planActivationRequest.create.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        planId: 5,
        status: "PENDING",
      });

      const result = await PlanActivationService.createRequest({
        teamId: 10,
        planId: 5,
        requestedByUserId: 99,
      });

      expect(result.status).toBe("PENDING");
      expect(mockDb.planActivationRequest.create).toHaveBeenCalledOnce();
    });

    it("returns the existing pending request to avoid duplicates", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        isActive: true,
        isEnterprise: false,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.planActivationRequest.findFirst.mockResolvedValue({
        id: "req_existing",
        status: "PENDING",
      });

      const result = await PlanActivationService.createRequest({
        teamId: 10,
        planId: 5,
        requestedByUserId: 99,
      });

      expect(result.id).toBe("req_existing");
      expect(mockDb.planActivationRequest.create).not.toHaveBeenCalled();
    });

    it("rejects enterprise plans", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 7,
        isActive: true,
        isEnterprise: true,
      });

      await expect(
        PlanActivationService.createRequest({
          teamId: 10,
          planId: 7,
          requestedByUserId: 99,
        }),
      ).rejects.toThrow(/empresariales/i);
    });

    it("rejects when plan is inactive", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        isActive: false,
        isEnterprise: false,
      });

      await expect(
        PlanActivationService.createRequest({
          teamId: 10,
          planId: 5,
          requestedByUserId: 99,
        }),
      ).rejects.toThrow(/no está disponible/i);
    });
  });

  describe("approve", () => {
    it("assigns plan to team and marks request APPROVED", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        planId: 5,
        status: "PENDING",
        plan: { key: "orbita", id: 5 },
        team: { id: 10 },
      });
      mockDb.team.update.mockResolvedValue({});
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_1",
        status: "APPROVED",
      });

      const result = await PlanActivationService.approve({
        requestId: "req_1",
        reviewedByUserId: 1,
      });

      expect(result.status).toBe("APPROVED");
      expect(mockDb.$transaction).toHaveBeenCalledOnce();
      expect(mockTeamService.refreshTeamCache).toHaveBeenCalledWith(10);
      expect(mockPlanService.invalidateTeam).toHaveBeenCalledWith(10);
    });

    it("refuses to approve already-approved requests", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        status: "APPROVED",
        plan: {},
        team: {},
      });

      await expect(
        PlanActivationService.approve({ requestId: "req_1", reviewedByUserId: 1 }),
      ).rejects.toThrow(/APPROVED/);
    });
  });

  describe("reject", () => {
    it("marks request REJECTED with reason", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        status: "PENDING",
      });
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_1",
        status: "REJECTED",
      });

      const result = await PlanActivationService.reject({
        requestId: "req_1",
        reviewedByUserId: 1,
        rejectionReason: "pago no confirmado",
      });

      expect(result.status).toBe("REJECTED");
      expect(mockDb.planActivationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "REJECTED",
            rejectionReason: "pago no confirmado",
          }),
        }),
      );
    });
  });

  describe("cancelOwn", () => {
    it("allows owner to cancel a PENDING request", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        status: "PENDING",
      });
      mockDb.planActivationRequest.update.mockResolvedValue({});

      await expect(
        PlanActivationService.cancelOwn("req_1", 10, 99),
      ).resolves.toBeUndefined();
    });

    it("rejects cancel from a different team", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        status: "PENDING",
      });

      await expect(
        PlanActivationService.cancelOwn("req_1", 999, 99),
      ).rejects.toThrow();
    });
  });
});
