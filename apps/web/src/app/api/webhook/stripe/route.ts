import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getGatewayByProvider } from "~/server/payments/gateway-registry";

export async function POST(req: Request) {
  const body = await req.text();
  const hdrs = await headers();

  const gateway = await getGatewayByProvider("STRIPE");
  if (!gateway) {
    return new NextResponse("Stripe gateway not configured", { status: 400 });
  }

  const plainHeaders = new Headers();
  hdrs.forEach((value, key) => plainHeaders.set(key, value));

  const result = await gateway.handleWebhook(plainHeaders, body);
  if (!result.ok) {
    return new NextResponse(result.message ?? "Webhook error", { status: 400 });
  }

  return new NextResponse("OK", { status: 200 });
}
