import { Context, Next } from "hono";
import { timingSafeEqual } from "crypto";
import { env } from "~/env";
import { UnsendApiError } from "../public-api/api-error";

export async function requireAdminKey(c: Context, next: Next) {
  const configured = env.PORTAL_ADMIN_API_KEY;
  if (!configured) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message: "Admin API is not configured on this instance",
    });
  }

  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnsendApiError({
      code: "UNAUTHORIZED",
      message: "Missing Bearer token",
    });
  }

  const supplied = header.slice(7).trim();
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new UnsendApiError({
      code: "UNAUTHORIZED",
      message: "Invalid admin token",
    });
  }

  await next();
}
