// Shared formatters for the commercial UI (Spanish, Colombia).

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Whole days from now to the given date; negative when already past.
export function daysUntil(value: Date | string) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO").format(value);
}
