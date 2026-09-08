import { env } from "~/env";
import { UseSend } from "usesend-js";
import { isSelfHosted } from "~/utils/common";
import { db } from "./db";
import { getDomains } from "./service/domain-service";
import { sendEmail } from "./service/email-service";
import { logger } from "./logger/log";
import { renderOtpEmail, renderTeamInviteEmail } from "./email-templates";

let usesend: UseSend | undefined;

const getClient = () => {
  if (!usesend) {
    usesend = new UseSend(env.USESEND_API_KEY ?? env.UNSEND_API_KEY);
  }
  return usesend;
};

export async function sendSignUpEmail(
  email: string,
  token: string,
  url: string
) {
  const { host } = new URL(url);

  if (env.NODE_ENV === "development") {
    logger.info({ email, url, token }, "Sending sign in email");
    return;
  }

  const subject = "Sign in to useSend";

  // Use jsx-email template for beautiful HTML
  const html = await renderOtpEmail({
    otpCode: token.toUpperCase(),
    loginUrl: url,
    hostName: host,
  });

  // Fallback text version
  const text = `Hey,\n\nYou can sign in to useSend by clicking the below URL:\n${url}\n\nYou can also use this OTP: ${token}\n\nThanks,\nuseSend Team`;

  await sendMail(email, subject, text, html);
}

export async function sendTeamInviteEmail(
  email: string,
  url: string,
  teamName: string
) {
  const { host } = new URL(url);

  if (env.NODE_ENV === "development") {
    logger.info({ email, url, teamName }, "Sending team invite email");
    return;
  }

  const subject = "You have been invited to join useSend";

  // Use jsx-email template for beautiful HTML
  const html = await renderTeamInviteEmail({
    teamName,
    inviteUrl: url,
  });

  // Fallback text version
  const text = `Hey,\n\nYou have been invited to join the team ${teamName} on useSend.\n\nYou can accept the invitation by clicking the below URL:\n${url}\n\nThanks,\nuseSend Team`;

  await sendMail(email, subject, text, html);
}

export async function sendSubscriptionConfirmationEmail(email: string) {
  if (!env.FOUNDER_EMAIL) {
    logger.error("FOUNDER_EMAIL not configured");
    return;
  }

  const subject = "Thanks for subscribing to useSend";
  const text = `Hey,\n\nThanks for subscribing to useSend, just wanted to let you know you can join the discord server to have a dedicated support channel for your team. So that we can address your queries / bugs asap.\n\nYou can join over using the link: https://discord.com/invite/BU8n8pJv8S\n\nIf you prefer slack, please let me know\n\ncheers,\nkoushik - useSend`;
  const html = text.replace(/\n/g, "<br />");

  await sendMail(email, subject, text, html, undefined, env.FOUNDER_EMAIL);
}

// ---------------------------------------------------------------------------
// Plan activation lifecycle emails (manual billing). Spanish, like the rest of
// the commercial surface of the dashboard.
// ---------------------------------------------------------------------------

const PLAN_EMAIL_SIGNATURE = "Equipo moSend";

function appBaseUrl() {
  return (env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSpanishDate(date: Date) {
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function renderPlanEmailHtml(
  title: string,
  paragraphs: string[],
  cta?: { label: string; url: string }
) {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;color:#1f2937;">${p}</p>`
    )
    .join("");
  const button = cta
    ? `<p style="margin:24px 0 0 0;"><a href="${cta.url}" style="display:inline-block;padding:10px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">${cta.label}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;"><h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;">${title}</h1>${body}${button}<p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">${PLAN_EMAIL_SIGNATURE}</p></div></body></html>`;
}

async function sendPlanEmail(
  email: string,
  subject: string,
  paragraphs: string[],
  cta?: { label: string; url: string }
) {
  const text = `${paragraphs.join("\n\n")}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\n${PLAN_EMAIL_SIGNATURE}`;
  const html = renderPlanEmailHtml(
    subject,
    paragraphs.map((p) => escapeHtml(p)),
    cta
  );

  if (env.NODE_ENV === "development") {
    logger.info({ email, subject, text }, "Sending plan email");
    return;
  }

  await sendMail(email, subject, text, html);
}

export async function sendPlanActivatedEmail(
  email: string,
  opts: { planName: string; expiresAt: Date | null }
) {
  const validity = opts.expiresAt
    ? `Tu plan tiene vigencia hasta el ${formatSpanishDate(opts.expiresAt)}. Te avisaremos unos días antes para que lo renueves sin interrupciones.`
    : "Tu plan no tiene fecha de vencimiento.";

  await sendPlanEmail(
    email,
    `Tu plan ${opts.planName} está activo`,
    [
      "Hola,",
      `Activamos tu plan ${opts.planName} en moSend. Ya podés enviar correos con los límites de tu nuevo plan.`,
      validity,
    ],
    { label: "Ver mi plan", url: `${appBaseUrl()}/settings/billing` }
  );
}

export async function sendPlanRejectedEmail(
  email: string,
  opts: { planName: string; reason: string }
) {
  await sendPlanEmail(
    email,
    `No pudimos activar tu plan ${opts.planName}`,
    [
      "Hola,",
      `Revisamos tu solicitud del plan ${opts.planName} y no pudimos aprobarla por este motivo:`,
      opts.reason,
      "Si creés que se trata de un error o querés reintentar con otro medio de pago, respondé a este correo o volvé a solicitar el plan.",
    ],
    { label: "Ver planes", url: `${appBaseUrl()}/pricing` }
  );
}

export async function sendPlanExpiringEmail(
  email: string,
  opts: { planName: string; expiresAt: Date; daysLeft: number }
) {
  const when =
    opts.daysLeft <= 1
      ? "vence mañana"
      : `vence en ${opts.daysLeft} días, el ${formatSpanishDate(opts.expiresAt)}`;

  await sendPlanEmail(
    email,
    `Tu plan ${opts.planName} ${opts.daysLeft <= 1 ? "vence mañana" : "está por vencer"}`,
    [
      "Hola,",
      `Tu plan ${opts.planName} en moSend ${when}.`,
      "Para seguir enviando con los mismos límites, realizá el pago de la renovación y avisanos con el comprobante. Si no renovás, tu cuenta pasará automáticamente al plan gratuito al vencer.",
    ],
    { label: "Renovar mi plan", url: `${appBaseUrl()}/pricing` }
  );
}

export async function sendPlanExpiredEmail(
  email: string,
  opts: { planName: string }
) {
  await sendPlanEmail(
    email,
    `Tu plan ${opts.planName} venció`,
    [
      "Hola,",
      `El período de tu plan ${opts.planName} en moSend terminó y tu cuenta pasó al plan gratuito, con sus límites de envío.`,
      "Podés reactivar tu plan en cualquier momento realizando el pago y solicitando la activación.",
    ],
    { label: "Reactivar mi plan", url: `${appBaseUrl()}/pricing` }
  );
}

export async function sendMail(
  email: string,
  subject: string,
  text: string,
  html: string,
  replyTo?: string,
  fromOverride?: string
) {
  if (isSelfHosted()) {
    logger.info("Sending email using self hosted");
    /* 
      Self hosted so checking if we can send using one of the available domain
      Assuming self hosted will have only one team
      TODO: fix this
     */
    const team = await db.team.findFirst({});
    if (!team) {
      logger.error("No team found");
      return;
    }

    const domains = await getDomains(team.id);

    if (domains.length === 0 || !domains[0]) {
      logger.error("No domains found");
      return;
    }

    const availableDomains = domains.map((d) => d.name);
    const domain = domains[0];

    const candidateFroms = [fromOverride, env.FROM_EMAIL, `hello@${domain.name}`].filter(
      (value): value is string => Boolean(value)
    );

    const selectedFrom =
      candidateFroms.find((address) => {
        const domainPart = address.split("@")[1];
        return domainPart ? availableDomains.includes(domainPart) : false;
      }) ?? `hello@${domain.name}`;

    await sendEmail({
      teamId: team.id,
      to: email,
      from: selectedFrom,
      subject,
      text,
      html,
      replyTo,
    });
  } else if (env.UNSEND_API_KEY && (env.FROM_EMAIL || fromOverride)) {
    const fromAddress = fromOverride ?? env.FROM_EMAIL!;
    const resp = await getClient().emails.send({
      to: email,
      from: fromAddress,
      subject,
      text,
      html,
      replyTo,
    });

    if (resp.data) {
      logger.info("Email sent using usesend");
      return;
    } else {
      logger.error(
        { code: resp.error?.code, message: resp.error?.message },
        "Error sending email using usesend"
      );
    }
  } else {
    throw new Error("USESEND_API_KEY/UNSEND_API_KEY not found");
  }
}
