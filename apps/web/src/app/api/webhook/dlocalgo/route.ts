import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getGatewayByProvider } from "~/server/payments/gateway-registry";

export async function POST(req: Request) {
  const body = await req.text();
  const hdrs = await headers();

  const gateway = await getGatewayByProvider("DLOCALGO");
  if (!gateway) {
    return new NextResponse("dLocal Go gateway not configured", { status: 400 });
  }

  const plainHeaders = new Headers();
  hdrs.forEach((value, key) => plainHeaders.set(key, value));

  try {
    const result = await gateway.handleWebhook(plainHeaders, body);
    if (!result.ok) {
      return new NextResponse(result.message ?? "Webhook rejected", {
        status: 400,
      });
    }
    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    // Until the real integration lands, NotImplementedError bubbles up.
    const message = err instanceof Error ? err.message : "Webhook error";
    return new NextResponse(message, { status: 501 });
  }
}
