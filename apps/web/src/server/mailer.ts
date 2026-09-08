import { env } from "~/env";
import { UseSend } from "usesend-js";
import { isSelfHosted } from "~/utils/common";
import { db } from "./db";
import { getDomains } from "./service/domain-service";
import { sendEmail } from "./service/email-service";
import { logger } from "./logger/log";
import { renderOtpEmail, renderTeamInviteEmail } from "./email-templates";
import type { EmailAttachment } from "~/types";

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

export interface PlanEmailAttachment {
  filename: string;
  pdf: Buffer;
}

function toEmailAttachments(
  attachments?: PlanEmailAttachment[]
): EmailAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((a) => ({
    filename: a.filename,
    content: a.pdf.toString("base64"),
  }));
}

async function sendPlanEmail(
  email: string,
  subject: string,
  paragraphs: string[],
  cta?: { label: string; url: string },
  attachments?: PlanEmailAttachment[]
) {
  const text = `${paragraphs.join("\n\n")}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\n${PLAN_EMAIL_SIGNATURE}`;
  const html = renderPlanEmailHtml(
    subject,
    paragraphs.map((p) => escapeHtml(p)),
    cta
  );

  if (env.NODE_ENV === "development") {
    logger.info(
      { email, subject, text, attachments: attachments?.map((a) => a.filename) },
      "Sending plan email"
    );
    return;
  }

  await sendMail(
    email,
    subject,
    text,
    html,
    undefined,
    undefined,
    toEmailAttachments(attachments)
  );
}

export async function sendPlanActivatedEmail(
  email: string,
  opts: {
    planName: string;
    expiresAt: Date | null;
    periodStart?: Date | null;
    invoice?: {
      number: string;
      amountLabel?: string;
      attachment: PlanEmailAttachment;
    } | null;
  }
) {
  const startsLater =
    opts.periodStart && opts.periodStart.getTime() > Date.now() + 60_000;
  const validity = opts.expiresAt
    ? startsLater
      ? `Tu período actual sigue vigente y el nuevo corre desde el ${formatSpanishDate(opts.periodStart!)} hasta el ${formatSpanishDate(opts.expiresAt)}. Te avisaremos unos días antes de que venza.`
      : `Tu plan tiene vigencia hasta el ${formatSpanishDate(opts.expiresAt)}. Te avisaremos unos días antes para que lo renueves sin interrupciones.`
    : "Tu plan no tiene fecha de vencimiento.";
  const paragraphs = ["Hola,"];
  if (opts.invoice) {
    paragraphs.push(
      `Registramos tu pago${opts.invoice.amountLabel ? ` por ${opts.invoice.amountLabel}` : ""} y tu plan ${opts.planName} en moSend queda activo. Adjuntamos la factura ${opts.invoice.number} como comprobante.`
    );
  } else {
    paragraphs.push(
      `Activamos tu plan ${opts.planName} en moSend. Ya podés enviar correos con los límites de tu nuevo plan.`
    );
  }
  paragraphs.push(validity);

  await sendPlanEmail(
    email,
    opts.invoice
      ? `Pago recibido: factura ${opts.invoice.number} · plan ${opts.planName} activo`
      : `Tu plan ${opts.planName} está activo`,
    paragraphs,
    { label: "Ver mi plan", url: `${appBaseUrl()}/settings/billing` },
    opts.invoice ? [opts.invoice.attachment] : undefined
  );
}

// Standalone invoice mail: a cuenta de cobro issued by the operator, or a
// factura re-sent on request.
export async function sendInvoiceEmail(
  email: string,
  opts: {
    kind: "pending" | "paid";
    number: string;
    planName: string;
    amountLabel: string;
    dueAt?: Date | null;
    attachment: PlanEmailAttachment;
  }
) {
  const paragraphs = ["Hola,"];
  if (opts.kind === "pending") {
    paragraphs.push(
      `Adjuntamos la cuenta de cobro ${opts.number} por ${opts.amountLabel}, correspondiente al plan ${opts.planName} en moSend${opts.dueAt ? `, con vencimiento el ${formatSpanishDate(opts.dueAt)}` : ""}.`,
      "Realizá el pago por transferencia o el medio acordado y respondé este correo con el comprobante. Al confirmarlo activamos o renovamos tu plan de inmediato."
    );
  } else {
    paragraphs.push(
      `Adjuntamos la factura ${opts.number} por ${opts.amountLabel} del plan ${opts.planName} en moSend, correspondiente al pago que ya registramos. Gracias.`
    );
  }

  await sendPlanEmail(
    email,
    opts.kind === "pending"
      ? `Cuenta de cobro ${opts.number} · plan ${opts.planName}`
      : `Factura ${opts.number} · plan ${opts.planName}`,
    paragraphs,
    { label: "Ver mi plan", url: `${appBaseUrl()}/settings/billing` },
    [opts.attachment]
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
  opts: {
    planName: string;
    expiresAt: Date;
    daysLeft: number;
    invoice?: {
      number: string;
      amountLabel: string;
      attachment: PlanEmailAttachment;
    } | null;
  }
) {
  const when =
    opts.daysLeft <= 1
      ? "vence mañana"
      : `vence en ${opts.daysLeft} días, el ${formatSpanishDate(opts.expiresAt)}`;
  const paragraphs = ["Hola,", `Tu plan ${opts.planName} en moSend ${when}.`];
  if (opts.invoice) {
    paragraphs.push(
      `Adjuntamos la cuenta de cobro ${opts.invoice.number} por ${opts.invoice.amountLabel} para renovar el próximo período. Realizá el pago y respondé este correo con el comprobante.`
    );
  } else {
    paragraphs.push(
      "Para seguir enviando con los mismos límites, realizá el pago de la renovación y avisanos con el comprobante."
    );
  }
  paragraphs.push(
    "Si el pago no queda registrado antes del vencimiento, la cuenta se suspende automáticamente hasta que se regularice."
  );

  await sendPlanEmail(
    email,
    `${opts.daysLeft <= 1 ? "Vence mañana" : "Aviso de pago"}: plan ${opts.planName}`,
    paragraphs,
    { label: "Ver mi plan", url: `${appBaseUrl()}/settings/billing` },
    opts.invoice ? [opts.invoice.attachment] : undefined
  );
}

export async function sendPlanSuspendedEmail(
  email: string,
  opts: {
    planName: string;
    expiredAt: Date;
    invoice?: {
      number: string;
      amountLabel: string;
      attachment: PlanEmailAttachment;
    } | null;
  }
) {
  const paragraphs = [
    "Hola,",
    `El período de tu plan ${opts.planName} en moSend venció el ${formatSpanishDate(opts.expiredAt)} y no encontramos el pago registrado, así que tu cuenta quedó suspendida: los envíos están bloqueados hasta regularizar el pago.`,
  ];
  if (opts.invoice) {
    paragraphs.push(
      `Adjuntamos la cuenta de cobro ${opts.invoice.number} por ${opts.invoice.amountLabel}. Apenas confirmemos el pago reactivamos tu plan de inmediato.`
    );
  } else {
    paragraphs.push(
      "Realizá el pago de la renovación y respondé este correo con el comprobante; apenas lo confirmemos reactivamos tu plan."
    );
  }

  await sendPlanEmail(
    email,
    `Cuenta suspendida: plan ${opts.planName} vencido`,
    paragraphs,
    { label: "Ver mi plan", url: `${appBaseUrl()}/settings/billing` },
    opts.invoice ? [opts.invoice.attachment] : undefined
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

export async function sendClientWelcomeEmail(
  email: string,
  opts: { name: string | null; domains: string[] }
) {
  const greeting = opts.name ? `Hola ${opts.name},` : "Hola,";
  const domainsLine =
    opts.domains.length > 0
      ? `Podés enviar correos desde: ${opts.domains.join(", ")}.`
      : "Cuando ingreses vas a poder agregar y verificar tus dominios de envío.";

  await sendPlanEmail(
    email,
    "Tu cuenta en moSend está lista",
    [
      greeting,
      "Creamos tu cuenta en moSend, la plataforma de envío de correos de Moshipp.",
      `Para ingresar, usá este mismo email (${email}): te enviaremos un código de acceso, o podés entrar con Google o GitHub si usan la misma dirección.`,
      domainsLine,
    ],
    { label: "Ingresar a moSend", url: `${appBaseUrl()}/login` }
  );
}

export async function sendMail(
  email: string,
  subject: string,
  text: string,
  html: string,
  replyTo?: string,
  fromOverride?: string,
  attachments?: EmailAttachment[]
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
      attachments,
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
      ...(attachments ? { attachments } : {}),
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
