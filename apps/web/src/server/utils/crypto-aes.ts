import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { env } from "~/env";

const ALGO = "aes-256-gcm";
const SALT = "moSend-admin-salt-v1";

function getKey(): Buffer {
  const secret = env.ADMIN_CREDS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "ADMIN_CREDS_ENCRYPTION_KEY is not set — cannot encrypt/decrypt gateway credentials",
    );
  }
  return scryptSync(secret, SALT, 32);
}

export interface EncryptedPayload {
  cipher: string;
  iv: string;
  tag: string;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    cipher: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.cipher, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptJSON(data: unknown): EncryptedPayload {
  return encryptSecret(JSON.stringify(data));
}

export function decryptJSON<T>(payload: EncryptedPayload): T {
  return JSON.parse(decryptSecret(payload)) as T;
}
