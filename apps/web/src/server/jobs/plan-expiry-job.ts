import { Queue, Worker } from "bullmq";
import { logger } from "~/server/logger/log";
import { getRedis, BULL_PREFIX } from "~/server/redis";
import {
  PLAN_EXPIRY_QUEUE,
  DEFAULT_QUEUE_OPTIONS,
} from "~/server/queue/queue-constants";
import { PlanActivationService } from "~/server/service/plan-activation-service";

let initialized = false;

// One daily tick handles the whole manual billing cycle: reminders first so a
// plan expiring today still gets its final notice, then the downgrade.
export async function runPlanExpiryTick(now = new Date()) {
  const reminders = await PlanActivationService.sendReminders(now);
  const expired = await PlanActivationService.expireDue(now);
  logger.info(
    { ...reminders, expired },
    "[PlanExpiryJob]: Tick completed",
  );
  return { ...reminders, expired };
}

export async function initPlanExpiryJob() {
  if (initialized) {
    return;
  }

  const connection = getRedis();
  const queue = new Queue(PLAN_EXPIRY_QUEUE, {
    connection,
    prefix: BULL_PREFIX,
    skipVersionCheck: true,
  });

  const worker = new Worker(
    PLAN_EXPIRY_QUEUE,
    async () => {
      await runPlanExpiryTick();
    },
    {
      connection,
      concurrency: 1,
      prefix: BULL_PREFIX,
      skipVersionCheck: true,
    },
  );

  // 08:00 UTC = 03:00 America/Bogota, before customers start their day.
  await queue.upsertJobScheduler(
    "plan-expiry-daily",
    {
      pattern: "0 8 * * *",
      tz: "UTC",
    },
    {
      opts: {
        ...DEFAULT_QUEUE_OPTIONS,
      },
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[PlanExpiryJob]: Job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "[PlanExpiryJob]: Job failed");
  });

  logger.info(
    { schedule: "0 8 * * * UTC" },
    "[PlanExpiryJob]: Scheduled daily reminders and expiry",
  );
  initialized = true;
}
