import { domainRouter } from "~/server/api/routers/domain";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { apiRouter } from "./routers/api";
import { emailRouter } from "./routers/email";
import { teamRouter } from "./routers/team";
import { adminRouter } from "./routers/admin";
import { adminPlansRouter } from "./routers/admin-plans";
import { adminTeamsRouter } from "./routers/admin-teams";
import { adminGatewaysRouter } from "./routers/admin-gateways";
import { adminMetricsRouter } from "./routers/admin-metrics";
import { adminActivationsRouter } from "./routers/admin-activations";
import { planRouter } from "./routers/plan";
import { planActivationRouter } from "./routers/plan-activation";
import { contactsRouter } from "./routers/contacts";
import { campaignRouter } from "./routers/campaign";
import { templateRouter } from "./routers/template";
import { billingRouter } from "./routers/billing";
import { invitationRouter } from "./routers/invitiation";
import { dashboardRouter } from "./routers/dashboard";
import { suppressionRouter } from "./routers/suppression";
import { limitsRouter } from "./routers/limits";
import { waitlistRouter } from "./routers/waitlist";
import { feedbackRouter } from "./routers/feedback";
import { webhookRouter } from "./routers/webhook";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  domain: domainRouter,
  apiKey: apiRouter,
  email: emailRouter,
  team: teamRouter,
  admin: adminRouter,
  adminPlans: adminPlansRouter,
  adminTeams: adminTeamsRouter,
  adminGateways: adminGatewaysRouter,
  adminMetrics: adminMetricsRouter,
  adminActivations: adminActivationsRouter,
  plan: planRouter,
  planActivation: planActivationRouter,
  contacts: contactsRouter,
  campaign: campaignRouter,
  template: templateRouter,
  billing: billingRouter,
  invitation: invitationRouter,
  dashboard: dashboardRouter,
  suppression: suppressionRouter,
  limits: limitsRouter,
  waitlist: waitlistRouter,
  feedback: feedbackRouter,
  webhook: webhookRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
