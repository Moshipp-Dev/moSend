import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: {
    ADMIN_CREDS_ENCRYPTION_KEY: "super-long-secret-value-for-testing-only-xxx",
  },
}));

import {
  encryptSecret,
  decryptSecret,
  encryptJSON,
  decryptJSON,
} from "~/server/utils/crypto-aes";

describe("crypto-aes", () => {
  it("encrypts and decrypts a plaintext string", () => {
    const encrypted = encryptSecret("hello world");
    expect(encrypted.cipher).not.toBe("hello world");
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe("hello world");
  });

  it("produces different ciphertext for same plaintext (IV randomness)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a.cipher).not.toBe(b.cipher);
    expect(a.iv).not.toBe(b.iv);
  });

  it("roundtrips JSON objects", () => {
    const payload = { foo: "bar", nested: { num: 42 } };
    const encrypted = encryptJSON(payload);
    const decrypted = decryptJSON<typeof payload>(encrypted);
    expect(decrypted).toEqual(payload);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptSecret("sensitive");
    const tampered = { ...encrypted, cipher: encrypted.cipher.replace(/./, "0") };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
