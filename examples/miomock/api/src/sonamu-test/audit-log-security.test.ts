import fastify from "fastify";
import { type AuditLogEvent, DB, ingestAuditEvent, Sonamu } from "sonamu";
import { bootstrap, createBetterAuthRequest } from "sonamu/test";
import { describe, expect, test, vi } from "vitest";

bootstrap(vi);

const AUTH_BASE = "http://localhost:10280/api/auth";

async function callAuth(path: string, body: Record<string, string>): Promise<Response> {
  return Sonamu.auth.handler(
    new Request(`${AUTH_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("감사 로그 클라이언트 IP", () => {
  test("Fastify가 해석한 IP가 위조된 전달 헤더보다 우선된다", async () => {
    const trustedIp = "203.0.113.10";
    const server = fastify();
    server.get("/bridge", (request) => {
      const authRequest = createBetterAuthRequest(request, ["x-client-ip"]);
      return {
        cfConnectingIp: authRequest.headers.get("cf-connecting-ip"),
        xClientIp: authRequest.headers.get("x-client-ip"),
        xForwardedFor: authRequest.headers.get("x-forwarded-for"),
        xRealIp: authRequest.headers.get("x-real-ip"),
        xVercelForwardedFor: authRequest.headers.get("x-vercel-forwarded-for"),
      };
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/bridge",
        remoteAddress: trustedIp,
        headers: {
          "cf-connecting-ip": "198.51.100.1",
          "x-client-ip": "198.51.100.5",
          "x-forwarded-for": "198.51.100.2",
          "x-real-ip": "198.51.100.3",
          "x-vercel-forwarded-for": "198.51.100.4",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        cfConnectingIp: trustedIp,
        xClientIp: trustedIp,
        xForwardedFor: trustedIp,
        xRealIp: trustedIp,
        xVercelForwardedFor: trustedIp,
      });
    } finally {
      await server.close();
    }
  });

  test("잘못된 IP는 감사 이벤트 적재를 막지 않는다", async () => {
    const wdb = DB.getDB("w");
    const invalidIps = ["not-an-ip", `fe80::1%${"a".repeat(38)}`];

    for (const [index, ipAddress] of invalidIps.entries()) {
      const eventKey = `audit-invalid-ip-${Date.now()}-${index}`;
      await ingestAuditEvent(wdb, {
        eventType: "user_created",
        eventKey,
        eventData: { identifier: `invalid-ip-${index}@example.com` },
        ipAddress,
      });

      const row = await wdb("audit_events").where("event_key", eventKey).first("ip_address");
      expect(row).toBeDefined();
      expect(row?.ip_address).toBeNull();
    }
  });

  test("같은 밀리초의 독립 이벤트는 각각 저장된다", async () => {
    const email = `audit-dedupe-${Date.now()}@example.com`;
    const password = "audit-dedupe-password";
    const signUpResponse = await callAuth("/sign-up/email", {
      email,
      password,
      name: "audit-dedupe",
    });
    expect(signUpResponse.status).toBe(200);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T19:01:00.000Z"));
    try {
      const first = await callAuth("/sign-in/email", {
        email,
        password: "incorrect-password",
      });
      const second = await callAuth("/sign-in/email", {
        email,
        password: "incorrect-password",
      });
      expect(first.status).toBe(401);
      expect(second.status).toBe(401);
    } finally {
      vi.useRealTimers();
    }

    const wdb = DB.getDB("w");
    const rows = await wdb("audit_events")
      .where({ event_type: "user_sign_in_failed", identifier: email })
      .select("id");
    expect(rows).toHaveLength(2);
  });

  test("동일 eventId 재시도는 한 번만 저장된다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `audit-retry-${Date.now()}`;
    const event: AuditLogEvent = {
      eventId: "audit-retry-event-id",
      eventType: "user_sign_in_failed",
      eventKey,
      eventData: {
        identifier: "retry@example.com",
        occurredAt: "2026-04-10T19:02:00.000Z",
      },
    };

    await ingestAuditEvent(wdb, event);
    await ingestAuditEvent(wdb, {
      ...event,
      eventData: { ...event.eventData, occurredAt: "2026-04-10T19:03:00.000Z" },
    });

    const rows = await wdb("audit_events").where("event_key", eventKey).select("id");
    expect(rows).toHaveLength(1);
  });
});
