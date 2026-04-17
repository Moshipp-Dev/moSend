import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTeamService, mockPlanService } = vi.hoisted(() => {
  const teamUser = {
    findMany: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
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
  const user = { findUnique: vi.fn(), update: vi.fn() };
  const pricingPlan = { findUnique: vi.fn() };

  const mockDb = {
    pricingPlan,
    team,
    user,
    teamUser,
    domain,
    clientDomainAccess,
    planActivationRequest,
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
    mockPlanService: { invalidateTeam: vi.fn(), invalidateUser: vi.fn() },
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
    Object.values(mockDb.user).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.teamUser).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.domain).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.clientDomainAccess).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.planActivationRequest).forEach((f) => (f as any).mockReset());
    (mockDb.$transaction as any).mockClear();
    mockTeamService.refreshTeamCache.mockReset();
    mockPlanService.invalidateTeam.mockReset();
    mockPlanService.invalidateUser.mockReset();
  });

  describe("createRequest", () => {
    it("creates a PENDING request scoped to targetUserId (defaults to requester)", async () => {
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
        targetUserId: 99,
        status: "PENDING",
      });

      const result = await PlanActivationService.createRequest({
        teamId: 10,
        planId: 5,
        requestedByUserId: 99,
      });

      expect(result.status).toBe("PENDING");
      expect(mockDb.planActivationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetUserId: 99 }),
        }),
      );
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
    it("when targetUserId is set, assigns plan to the user (not the team)", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        planId: 5,
        targetUserId: 77,
        status: "PENDING",
        plan: { key: "orbita", id: 5 },
      });
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_1",
        status: "APPROVED",
      });

      const result = await PlanActivationService.approve({
        requestId: "req_1",
        reviewedByUserId: 1,
      });

      expect(result.status).toBe("APPROVED");
      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 77 },
          data: { pricingPlan: { connect: { id: 5 } } },
        }),
      );
      expect(mockDb.team.update).not.toHaveBeenCalled();
      expect(mockPlanService.invalidateUser).toHaveBeenCalledWith(77);
    });

    it("without targetUserId, falls back to assigning the plan to the team", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_legacy",
        teamId: 10,
        planId: 5,
        targetUserId: null,
        status: "PENDING",
        plan: { key: "orbita", id: 5 },
      });
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_legacy",
        status: "APPROVED",
      });

      await PlanActivationService.approve({
        requestId: "req_legacy",
        reviewedByUserId: 1,
      });

      expect(mockDb.team.update).toHaveBeenCalled();
      expect(mockDb.user.update).not.toHaveBeenCalled();
    });

    it("refuses to approve already-approved requests", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        status: "APPROVED",
        plan: {},
      });

      await expect(
        PlanActivationService.approve({ requestId: "req_1", reviewedByUserId: 1 }),
      ).rejects.toThrow(/APPROVED/);
    });
  });

  describe("manualAssign", () => {
    it("with targetUserId, requires the user to belong to the team", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.teamUser.findUnique.mockResolvedValue(null);

      await expect(
        PlanActivationService.manualAssign({
          teamId: 10,
          planId: 5,
          adminUserId: 7,
          targetUserId: 99,
        }),
      ).rejects.toThrow(/no pertenece/i);
    });

    it("assigns per-user plan + records APPROVED request with targetUserId", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.teamUser.findUnique.mockResolvedValue({ teamId: 10, userId: 99, role: "CLIENT" });
      mockDb.planActivationRequest.create.mockResolvedValue({
        id: "req_manual",
        status: "APPROVED",
        targetUserId: 99,
      });

      await PlanActivationService.manualAssign({
        teamId: 10,
        planId: 5,
        adminUserId: 7,
        targetUserId: 99,
        paymentReference: "bancolombia-tx-1",
      });

      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99 },
          data: { pricingPlan: { connect: { id: 5 } } },
        }),
      );
      expect(mockDb.team.update).not.toHaveBeenCalled();
      expect(mockDb.planActivationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetUserId: 99, status: "APPROVED" }),
        }),
      );
      expect(mockPlanService.invalidateUser).toHaveBeenCalledWith(99);
    });

    it("without targetUserId, assigns plan to team (legacy)", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.planActivationRequest.create.mockResolvedValue({
        id: "req_legacy",
        status: "APPROVED",
      });

      await PlanActivationService.manualAssign({
        teamId: 10,
        planId: 5,
        adminUserId: 7,
      });

      expect(mockDb.team.update).toHaveBeenCalled();
      expect(mockDb.user.update).not.toHaveBeenCalled();
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
