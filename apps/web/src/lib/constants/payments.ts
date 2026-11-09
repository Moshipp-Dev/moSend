export const PLAN_PERKS = {
  FREE: [
    "Envía hasta 3000 correos por mes",
    "Envía hasta 100 correos por día",
    "Puede tener 1 libreta de contactos",
    "Puede tener 1 dominio",
    "Puede tener 1 miembro del equipo",
  ],
  BASIC: [
    "Incluye $10 de uso mensual",
    "Envía correos transaccionales a $0.0004 por correo",
    "Envía correos de marketing a $0.001 por correo",
    "Puede tener libretas de contactos ilimitadas",
    "Puede tener dominios ilimitados",
    "Puede tener miembros del equipo ilimitados",
  ],
};

/**
 * How new teams pay: $10 a month (Stripe STRIPE_BASIC_PRICE_ID) includes
 * 10,000 usage units, then $0.001 per unit (STRIPE_BASIC_USAGE_PRICE_ID).
 * A unit is one marketing or 2.5 transactional emails (see lib/usage.ts).
 */
export const PAY_AS_YOU_GO = {
  price: "$10 a month",
  includes: "Includes 25,000 transactional or 10,000 marketing emails",
  details: [
    "Includes 25,000 transactional or 10,000 marketing emails a month",
    "Then $0.40 per 1,000 transactional and $1 per 1,000 marketing emails",
    "Unlimited domains, contact books and team members",
    "Cancel anytime",
  ],
  cta: "Start for $10 a month",
};
