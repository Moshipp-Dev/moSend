import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const invitationRouter = createTRPCRouter({
  getUserInvites: protectedProcedure
    .input(
      z.object({
        inviteId: z.string().optional().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.email) {
        return [];
      }

      const invites = await ctx.db.teamInvite.findMany({
        where: {
          ...(input.inviteId
            ? { id: input.inviteId }
            : { email: ctx.session.user.email }),
        },
        include: {
          team: true,
        },
      });

      return invites;
    }),

  getInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invite = await ctx.db.teamInvite.findUnique({
        where: {
          id: input.inviteId,
        },
      });

      return invite;
    }),

  acceptTeamInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.teamInvite.findUnique({
        where: {
          id: input.inviteId,
        },
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      await ctx.db.teamUser.create({
        data: {
          teamId: invite.teamId,
          userId: ctx.session.user.id,
          role: invite.role,
        },
      });

      if (invite.role === "CLIENT" && invite.domainIds.length > 0) {
        await ctx.db.clientDomainAccess.createMany({
          data: invite.domainIds.map((domainId) => ({
            userId: ctx.session.user.id,
            domainId,
            teamId: invite.teamId,
          })),
          skipDuplicates: true,
        });
      }

      await ctx.db.teamInvite.delete({
        where: {
          id: input.inviteId,
        },
      });
      // No need to invalidate cache here again

      return true;
    }),
});
