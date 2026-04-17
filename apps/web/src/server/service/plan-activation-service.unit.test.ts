import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTeamService, mockPlanService } = vi.hoisted(() => {
  const teamUser = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const domain = {
    findMany: vi.fn(),
  };
  const clientDomainAccess = {
    upsert: vi.fn(),
  };
  const planActivationRequest = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };
  const team = { findUnique: vi.fn(), update: vi.fn() };
  const pricingPlan = { findUnique: vi.fn() };

  const mockDb = {
    pricingPlan,
    team,
    teamUser,
    domain,
    clientDomainAccess,
    planActivationRequest,
    // When called with a callback, run it with `mockDb` as tx so downgrade
    // helper sees the same mocks. When called with an ops array (legacy shape
    // kept for safety) still work by awaiting each op.
    $transaction: vi.fn(async (arg: any) => {
      if (typeof arg === "function") return arg(mockDb);
      const results: any[] = [];
      for (const op of arg) results.push(await op);
      return results;
    }),
  };

  return {
    mockDb,
    mockTeamService: { refreshTeamCache: vi.fn() },
    mockPlanService: { invalidateTeam: vi.fn() },
  };
});

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/service/team-service", () => ({ TeamService: mockTeamService }));
vi.mock("~/server/service/plan-service", () => ({ PlanService: mockPlanService }));

import { PlanActivationService } from "~/server/service/plan-activation-service";

describe("PlanActivationService", () => {
  beforeEach(() => {
    Object.values(mockDb.pricingPlan).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.team).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.teamUser).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.domain).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.clientDomainAccess).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.planActivationRequest).forEach((f) => (f as any).mockReset());
    (mockDb.$transaction as any).mockClear();
    mockTeamService.refreshTeamCache.mockReset();
    mockPlanService.invalidateTeam.mockReset();

    // Defaults: no admins, no domains — downgrade helper is a no-op. Tests
    // that exercise downgrade override these.
    mockDb.teamUser.findMany.mockResolvedValue([]);
    mockDb.domain.findMany.mockResolvedValue([]);
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

  describe("manualAssign", () => {
    it("creates an APPROVED request and assigns the plan to the team", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.team.update.mockResolvedValue({});
      mockDb.planActivationRequest.create.mockResolvedValue({
        id: "req_manual",
        status: "APPROVED",
        teamId: 10,
        planId: 5,
      });

      const result = await PlanActivationService.manualAssign({
        teamId: 10,
        planId: 5,
        adminUserId: 7,
        paymentReference: "bancolombia-tx-1",
      });

      expect(result.status).toBe("APPROVED");
      expect(mockDb.$transaction).toHaveBeenCalledOnce();
      expect(mockTeamService.refreshTeamCache).toHaveBeenCalledWith(10);
      expect(mockPlanService.invalidateTeam).toHaveBeenCalledWith(10);
    });

    it("downgrades existing ADMINs to CLIENT and grants domain access", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.team.update.mockResolvedValue({});
      mockDb.planActivationRequest.create.mockResolvedValue({
        id: "req_manual",
        status: "APPROVED",
      });
      mockDb.teamUser.findMany.mockResolvedValue([{ userId: 99 }, { userId: 100 }]);
      mockDb.domain.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await PlanActivationService.manualAssign({
        teamId: 10,
        planId: 5,
        adminUserId: 7,
      });

      // Both admins got demoted to CLIENT
      expect(mockDb.teamUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: "CLIENT" } }),
      );
      expect(mockDb.teamUser.update).toHaveBeenCalledTimes(2);

      // Domain access: 2 users × 2 domains = 4 upserts
      expect(mockDb.clientDomainAccess.upsert).toHaveBeenCalledTimes(4);
    });

    it("rejects when plan is inactive", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: false,
      });

      await expect(
        PlanActivationService.manualAssign({
          teamId: 10,
          planId: 5,
          adminUserId: 7,
        }),
      ).rejects.toThrow(/no está disponible/i);
    });

    it("rejects when team does not exist", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue(null);

      await expect(
        PlanActivationService.manualAssign({
          teamId: 999,
          planId: 5,
          adminUserId: 7,
        }),
      ).rejects.toThrow(/Team no encontrado/i);
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
