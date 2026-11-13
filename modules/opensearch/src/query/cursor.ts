import { createHmac, timingSafeEqual } from "node:crypto";

import { SearchCursorExpired, SearchQueryInvalid } from "../errors";
import { type CursorPayload, cursorPayloadSchema } from "./schemas";

// base64url(payload JSON) "." keyId "." base64url(HMAC-SHA256(payload "." keyId)). Length, format and signature are
// checked before the payload is parsed; any failure is SearchCursorExpired.

export const MAX_CURSOR_LENGTH = 16_384;

export interface CursorKey {
  id: string;
  secret: Uint8Array;
}

const CURSOR_PATTERN = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{43})$/;
const SIGNATURE_BYTES = 32;

function sign(secret: Uint8Array, signed: string): Buffer {
  return createHmac("sha256", secret).update(signed, "utf8").digest();
}

function expired(
  key: "cursor.malformed" | "cursor.invalidSignature" | "cursor.invalidPayload",
  reason: string,
): SearchCursorExpired {
  return new SearchCursorExpired({ key }, { details: { reason } });
}

export function encodeCursor(payload: CursorPayload, key: CursorKey): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signed = `${encodedPayload}.${key.id}`;
  const cursor = `${signed}.${sign(key.secret, signed).toString("base64url")}`;
  if (cursor.length > MAX_CURSOR_LENGTH) {
    throw new SearchQueryInvalid(
      { key: "query.cursorTooLarge", params: { maxLength: MAX_CURSOR_LENGTH } },
      { details: { reason: "cursor-too-large", maxLength: MAX_CURSOR_LENGTH } },
    );
  }
  return cursor;
}

// Expiry and target state are checked by the caller against catalog time.
export function decodeCursor(
  cursor: string,
  keys: readonly CursorKey[],
  maxCursorLifetimeMs: number,
): CursorPayload {
  if (cursor.length > MAX_CURSOR_LENGTH) {
    throw new SearchCursorExpired(
      { key: "cursor.tooLarge", params: { maxLength: MAX_CURSOR_LENGTH } },
      { details: { reason: "cursor-too-large", maxLength: MAX_CURSOR_LENGTH } },
    );
  }
  const match = CURSOR_PATTERN.exec(cursor);
  const encodedPayload = match?.[1];
  const keyId = match?.[2];
  const signature = match?.[3];
  if (encodedPayload === undefined || keyId === undefined || signature === undefined) {
    throw expired("cursor.malformed", "malformed");
  }
  const key = keys.find((candidate) => candidate.id === keyId);
  if (key === undefined) throw expired("cursor.invalidSignature", "unknown-key");

  const provided = Buffer.from(signature, "base64url");
  const expected = sign(key.secret, `${encodedPayload}.${keyId}`);
  // Refuses other base64url spellings of the same bytes so each cursor has one form.
  if (
    provided.byteLength !== SIGNATURE_BYTES ||
    provided.toString("base64url") !== signature ||
    !timingSafeEqual(provided, expected)
  ) {
    throw expired("cursor.invalidSignature", "bad-signature");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw expired("cursor.invalidPayload", "invalid-payload");
  }
  const payload = cursorPayloadSchema.safeParse(decoded);
  if (!payload.success || payload.data.exp - payload.data.iat > maxCursorLifetimeMs) {
    throw expired("cursor.invalidPayload", "invalid-payload");
  }
  return payload.data;
}
