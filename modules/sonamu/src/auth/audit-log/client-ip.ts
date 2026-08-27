import { isIP } from "node:net";

import { isStringValue } from "../../utils/runtime-value";

const CLIENT_IP_HEADERS = [
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
] as const;

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function replaceClientIpHeaders(
  headers: Headers,
  clientIp: string,
  configuredHeaders: readonly string[] = [],
): void {
  const candidates = new Set(
    [...CLIENT_IP_HEADERS, ...configuredHeaders]
      .map((header) => header.trim().toLowerCase())
      .filter((header) => HEADER_NAME_PATTERN.test(header)),
  );

  for (const header of candidates) {
    headers.delete(header);
  }

  for (const header of candidates) {
    headers.set(header, clientIp);
  }
}

export function getValidClientIp<Value>(value: Value): string | null {
  if (!isStringValue(value) || value.length > 45 || isIP(value) === 0) {
    return null;
  }

  return value;
}
