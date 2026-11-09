import { describe, expect, it } from "vitest";
import { isAllowedAuthUsername, parseAuthUsernames } from "./auth-usernames";

describe("parseAuthUsernames", () => {
  it("defaults to usesend when unset", () => {
    expect([...parseAuthUsernames(undefined)]).toEqual(["usesend"]);
  });

  it("keeps a single username unchanged", () => {
    expect([...parseAuthUsernames("mosend")]).toEqual(["mosend"]);
  });

  it("splits comma-separated usernames and trims spaces", () => {
    expect([...parseAuthUsernames("mosend, moshipp")]).toEqual([
      "mosend",
      "moshipp",
    ]);
  });

  it("falls back to the default when only separators are given", () => {
    expect([...parseAuthUsernames(" , ")]).toEqual(["usesend"]);
  });
});

describe("isAllowedAuthUsername", () => {
  const allowed = parseAuthUsernames("mosend,moshipp");

  it("accepts every configured username", () => {
    expect(isAllowedAuthUsername(allowed, "mosend")).toBe(true);
    expect(isAllowedAuthUsername(allowed, "moshipp")).toBe(true);
  });

  it("rejects unknown, partial or missing usernames", () => {
    expect(isAllowedAuthUsername(allowed, "usesend")).toBe(false);
    expect(isAllowedAuthUsername(allowed, "mosend,moshipp")).toBe(false);
    expect(isAllowedAuthUsername(allowed, undefined)).toBe(false);
  });
});
