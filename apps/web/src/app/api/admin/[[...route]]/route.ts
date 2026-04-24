import { handle } from "hono/vercel";
import { adminApp } from "~/server/admin-api";

export const GET = handle(adminApp);
export const POST = handle(adminApp);
export const PUT = handle(adminApp);
export const DELETE = handle(adminApp);
export const PATCH = handle(adminApp);
