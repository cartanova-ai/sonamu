import { randomBytes } from "node:crypto";

export type ParsedTraceParent = {
  version: string;
  traceId: string;
  parentId: string;
  traceFlags: number;
  sampled: boolean;
};

// traceparent 포맷: 00-<32 hex traceId>-<16 hex spanId>-<2 hex flags>
// 예시: 00-4bf92f3577b16d8a2e3e24ff02e6c998-00f067aa0ba902b7-01
const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ALL_ZERO_TRACE_ID = "00000000000000000000000000000000";
const ALL_ZERO_SPAN_ID = "0000000000000000";

export function parseTraceParent(header: string): ParsedTraceParent | null {
  const trimmed = header.trim().toLowerCase();
  const match = TRACEPARENT_REGEX.exec(trimmed);
  if (!match) return null;

  const [, version, traceId, parentId, flagsHex] = match;

  // ff는 W3C Trace Context 스펙에서 invalid version marker로 예약되어 있음
  if (version === "ff") return null;

  // W3C 스펙에 따라 모두 0인 trace id / span id는 유효하지 않음
  if (traceId === ALL_ZERO_TRACE_ID || parentId === ALL_ZERO_SPAN_ID) return null;

  const traceFlags = parseInt(flagsHex, 16);

  return {
    version,
    traceId,
    parentId,
    traceFlags,
    sampled: (traceFlags & 0x01) === 1,
  };
}

export function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

export function formatTraceParent(traceId: string, spanId: string, sampled: boolean): string {
  const flags = sampled ? "01" : "00";
  return `00-${traceId}-${spanId}-${flags}`;
}
