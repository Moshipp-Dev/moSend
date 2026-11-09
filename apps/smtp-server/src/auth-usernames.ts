const DEFAULT_AUTH_USERNAME = "usesend";

/**
 * Parses SMTP_AUTH_USERNAME, which may hold several comma-separated usernames
 * so one relay can serve clients configured with different usernames (e.g.
 * after merging two instances). Empty entries are ignored.
 */
export function parseAuthUsernames(value: string | undefined): Set<string> {
  const names = (value ?? DEFAULT_AUTH_USERNAME)
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  return new Set(names.length > 0 ? names : [DEFAULT_AUTH_USERNAME]);
}

export function isAllowedAuthUsername(
  allowed: Set<string>,
  username: string | undefined,
): boolean {
  return username !== undefined && allowed.has(username);
}
