import assert from "assert";
import { createHash } from "crypto";

import { type AuditLogEvent, DB, ingestAuditEvent } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { z } from "zod";

bootstrap(vi);

/**
 * Claim의 dedupe_key 정의와 동일한 필드 순서로 sha256 hex를 계산한다.
 * source|event_type|event_key|actor_user_id|subject_user_id|organization_id|team_id|session_id|identifier|reason|action|occurred_at.toISOString()
 * null 필드는 빈 문자열로 정규화.
 */
function computeDedupeKey(parts: {
  source: string | null;
  eventType: string | null;
  eventKey: string | null;
  actorUserId: string | null;
  subjectUserId: string | null;
  organizationId: string | null;
  teamId: string | null;
  sessionId: string | null;
  identifier: string | null;
  reason: string | null;
  action: string | null;
  occurredAt: Date;
}): string {
  const normalized = [
    parts.source ?? "",
    parts.eventType ?? "",
    parts.eventKey ?? "",
    parts.actorUserId ?? "",
    parts.subjectUserId ?? "",
    parts.organizationId ?? "",
    parts.teamId ?? "",
    parts.sessionId ?? "",
    parts.identifier ?? "",
    parts.reason ?? "",
    parts.action ?? "",
    parts.occurredAt.toISOString(),
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

describe("AuditEventModel ingest() 기본 동작", () => {
  test("ingest() 호출 시 audit_events에 1건 INSERT되고 각 컬럼 값이 올바르게 저장된다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `insert-basic-${Date.now()}`;
    const event: AuditLogEvent = {
      eventType: "user_created",
      eventKey,
      eventData: {
        triggeredBy: "actor-42",
        userId: "subject-42",
        organizationId: "org-42",
        teamId: "team-42",
        sessionId: "session-42",
        providerId: "credential",
        loginMethod: "password",
        identifier: "basic@example.com",
      },
      ipAddress: "127.0.0.1",
      city: "Seoul",
      country: "Korea, Republic of",
      countryCode: "KR",
    };

    await ingestAuditEvent(wdb, event);

    const rows = await wdb("audit_events").where("event_key", eventKey).select("*");
    expect(rows.length).toBe(1);
    const row = rows[0];
    assert(row);

    // source는 이벤트 소스 식별자로 ingest()가 채워야 한다 (NOT NULL, entity.json 예: better_auth)
    z.string().parse(row.source);
    expect(row.source.length).toBeGreaterThan(0);
    expect(row.event_type).toBe("user_created");
    expect(row.event_key).toBe(eventKey);
    expect(row.category).toBe("user");
    expect(row.actor_user_id).toBe("actor-42");
    expect(row.subject_user_id).toBe("subject-42");
    expect(row.organization_id).toBe("org-42");
    expect(row.team_id).toBe("team-42");
    expect(row.session_id).toBe("session-42");
    expect(row.provider_id).toBe("credential");
    expect(row.login_method).toBe("password");
    expect(row.identifier).toBe("basic@example.com");
    expect(row.ip_address).toBe("127.0.0.1");
    expect(row.city).toBe("Seoul");
    expect(row.country).toBe("Korea, Republic of");
    expect(row.country_code).toBe("KR");
    expect(row.dedupe_key).toBeTruthy();
    // occurred_at은 ingest() 내부에서 new Date()로 채워진다 (프록시 수신 시점)
    expect(row.occurred_at).toBeDefined();
    expect(new Date(row.occurred_at).getTime()).toBeGreaterThan(0);
  });

  test("payload_json에 eventData 원본이 그대로 보존된다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `payload-preserve-${Date.now()}`;
    const eventData = {
      triggeredBy: "actor-preserve",
      userId: "subject-preserve",
      organizationId: "org-preserve",
      extra: { nested: { key: "value", arr: [1, 2, 3] } },
      customFlag: true,
      occurredAt: "2026-04-10T12:00:00.000Z",
    };

    await ingestAuditEvent(wdb, {
      eventType: "user_created",
      eventKey,
      eventData,
    });

    const rows = await wdb("audit_events").where("event_key", eventKey).select("payload_json");
    expect(rows.length).toBe(1);
    const payload = rows[0]?.payload_json;
    expect(payload).toEqual(eventData);
  });

  test("eventData의 triggeredBy/userId/organizationId 등이 promoted 컬럼으로 올바르게 매핑된다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `promoted-${Date.now()}`;

    await ingestAuditEvent(wdb, {
      eventType: "organization_created",
      eventKey,
      eventData: {
        triggeredBy: "actor-promoted",
        userId: "subject-promoted",
        organizationId: "org-promoted",
        teamId: "team-promoted",
        sessionId: "session-promoted",
        providerId: "oauth-google",
        loginMethod: "oauth",
        identifier: "promoted@example.com",
        occurredAt: "2026-04-10T13:00:00.000Z",
      },
    });

    const rows = await wdb("audit_events").where("event_key", eventKey).select("*");
    const row = rows[0];
    assert(row);

    expect(row.actor_user_id).toBe("actor-promoted");
    expect(row.subject_user_id).toBe("subject-promoted");
    expect(row.organization_id).toBe("org-promoted");
    expect(row.team_id).toBe("team-promoted");
    expect(row.session_id).toBe("session-promoted");
    expect(row.provider_id).toBe("oauth-google");
    expect(row.login_method).toBe("oauth");
  });

  test("identifier 폴백 체인이 적용된다 (identifier → userEmail → memberEmail → inviteeEmail → acceptedByEmail → rejectedByEmail 순)", async () => {
    const wdb = DB.getDB("w");

    // 1) identifier가 존재하면 그대로 사용
    const k1 = `fallback-1-${Date.now()}`;
    await ingestAuditEvent(wdb, {
      eventType: "user_signed_in",
      eventKey: k1,
      eventData: {
        identifier: "identifier@example.com",
        userEmail: "user@example.com",
        memberEmail: "member@example.com",
        inviteeEmail: "invitee@example.com",
        acceptedByEmail: "accepted@example.com",
        rejectedByEmail: "rejected@example.com",
        occurredAt: "2026-04-10T14:00:00.000Z",
      },
    });

    // 2) identifier 없음 → userEmail
    const k2 = `fallback-2-${Date.now()}`;
    await ingestAuditEvent(wdb, {
      eventType: "user_signed_in",
      eventKey: k2,
      eventData: {
        userEmail: "user@example.com",
        memberEmail: "member@example.com",
        inviteeEmail: "invitee@example.com",
        occurredAt: "2026-04-10T14:01:00.000Z",
      },
    });

    // 3) identifier/userEmail 없음 → memberEmail
    const k3 = `fallback-3-${Date.now()}`;
    await ingestAuditEvent(wdb, {
      eventType: "user_signed_in",
      eventKey: k3,
      eventData: {
        memberEmail: "member@example.com",
        inviteeEmail: "invitee@example.com",
        occurredAt: "2026-04-10T14:02:00.000Z",
      },
    });

    // 4) inviteeEmail
    const k4 = `fallback-4-${Date.now()}`;
    await ingestAuditEvent(wdb, {
      eventType: "user_signed_in",
      eventKey: k4,
      eventData: {
        inviteeEmail: "invitee@example.com",
        acceptedByEmail: "accepted@example.com",
        occurredAt: "2026-04-10T14:03:00.000Z",
      },
    });

    // 5) acceptedByEmail
    const k5 = `fallback-5-${Date.now()}`;
    await ingestAuditEvent(wdb, {
      eventType: "user_signed_in",
      eventKey: k5,
      eventData: {
        acceptedByEmail: "accepted@example.com",
        rejectedByEmail: "rejected@example.com",
        occurredAt: "2026-04-10T14:04:00.000Z",
      },
    });

    // 6) rejectedByEmail
    const k6 = `fallback-6-${Date.now()}`;
    await ingestAuditEvent(wdb, {
      eventType: "user_signed_in",
      eventKey: k6,
      eventData: {
        rejectedByEmail: "rejected@example.com",
        occurredAt: "2026-04-10T14:05:00.000Z",
      },
    });

    const rows = await wdb("audit_events")
      .whereIn("event_key", [k1, k2, k3, k4, k5, k6])
      .select("event_key", "identifier");
    const byKey = new Map(rows.map((r) => [r.event_key, r.identifier]));

    expect(byKey.get(k1)).toBe("identifier@example.com");
    expect(byKey.get(k2)).toBe("user@example.com");
    expect(byKey.get(k3)).toBe("member@example.com");
    expect(byKey.get(k4)).toBe("invitee@example.com");
    expect(byKey.get(k5)).toBe("accepted@example.com");
    expect(byKey.get(k6)).toBe("rejected@example.com");
  });
});

describe("AuditEventModel category 분류", () => {
  test("event_type별로 category가 올바르게 분류된다 (user_created→user, user_signed_in→session, account_linked→account, organization_created→organization, security_blocked→security)", async () => {
    const wdb = DB.getDB("w");
    const suffix = Date.now();
    const cases: Array<{ eventType: string; expected: string }> = [
      { eventType: "user_created", expected: "user" },
      { eventType: "user_signed_in", expected: "session" },
      { eventType: "account_linked", expected: "account" },
      { eventType: "organization_created", expected: "organization" },
      { eventType: "security_blocked", expected: "security" },
    ];

    for (const [idx, c] of cases.entries()) {
      await ingestAuditEvent(wdb, {
        eventType: c.eventType,
        eventKey: `category-${c.eventType}-${suffix}-${idx}`,
        eventData: {
          identifier: `${c.eventType}@example.com`,
          occurredAt: `2026-04-10T15:0${idx}:00.000Z`,
        },
      });
    }

    for (const [idx, c] of cases.entries()) {
      const row = await wdb("audit_events")
        .where("event_key", `category-${c.eventType}-${suffix}-${idx}`)
        .first("category");
      assert(row);
      expect(row.category).toBe(c.expected);
    }
  });

  test("미등록 event_type은 user 카테고리로 fallback된다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `category-unknown-${Date.now()}`;

    await ingestAuditEvent(wdb, {
      eventType: "totally_unknown_event_type",
      eventKey,
      eventData: {
        identifier: "unknown@example.com",
        occurredAt: "2026-04-10T16:00:00.000Z",
      },
    });

    const row = await wdb("audit_events").where("event_key", eventKey).first("category");
    assert(row);
    expect(row.category).toBe("user");
  });
});

describe("AuditEventModel dedupe_key", () => {
  test("dedupe_key가 지정된 필드 조합의 sha256 hex로 계산된다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `dedupe-hash-${Date.now()}`;

    await ingestAuditEvent(wdb, {
      eventType: "user_created",
      eventKey,
      eventData: {
        triggeredBy: "actor-hash",
        userId: "subject-hash",
        organizationId: "org-hash",
        teamId: "team-hash",
        sessionId: "session-hash",
        identifier: "hash@example.com",
        reason: "manual",
        action: "create",
      },
    });

    // ingest()가 생성한 occurred_at/source를 그대로 읽어 해시를 재계산한다.
    const row = await wdb("audit_events")
      .where("event_key", eventKey)
      .first("dedupe_key", "source", "occurred_at");
    assert(row);

    const expected = computeDedupeKey({
      source: row.source,
      eventType: "user_created",
      eventKey,
      actorUserId: "actor-hash",
      subjectUserId: "subject-hash",
      organizationId: "org-hash",
      teamId: "team-hash",
      sessionId: "session-hash",
      identifier: "hash@example.com",
      reason: "manual",
      action: "create",
      occurredAt: new Date(row.occurred_at),
    });

    expect(row.dedupe_key).toBe(expected);
    // sha256 hex는 64자
    expect(row.dedupe_key).toMatch(/^[a-f0-9]{64}$/);
  });

  test("null 필드는 빈 문자열로 정규화 후 해시된다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `dedupe-null-${Date.now()}`;

    // 최소 필드만 지정 → 나머지는 null이 되어 빈 문자열로 정규화되어야 함
    await ingestAuditEvent(wdb, {
      eventType: "user_created",
      eventKey,
      eventData: {
        identifier: "nulltest@example.com",
      },
    });

    const row = await wdb("audit_events")
      .where("event_key", eventKey)
      .first("dedupe_key", "source", "occurred_at");
    assert(row);

    const expected = computeDedupeKey({
      source: row.source,
      eventType: "user_created",
      eventKey,
      actorUserId: null,
      subjectUserId: null,
      organizationId: null,
      teamId: null,
      sessionId: null,
      identifier: "nulltest@example.com",
      reason: null,
      action: null,
      occurredAt: new Date(row.occurred_at),
    });

    expect(row.dedupe_key).toBe(expected);
  });
});

describe("AuditEventModel dedupe 처리", () => {
  test("동일 dedupe_key로 두 번 ingest 시 첫 번째는 성공하고 두 번째는 예외 없이 무시되며 audit_events 행은 1건이다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `dedupe-silence-${Date.now()}`;
    const event: AuditLogEvent = {
      eventType: "user_signed_in",
      eventKey,
      eventData: {
        triggeredBy: "actor-dedupe",
        userId: "subject-dedupe",
        identifier: "dedupe@example.com",
      },
    };

    // dedupe_key는 occurred_at(=new Date() at ingest time)을 포함하므로,
    // 동일 dedupe_key를 만들려면 두 ingest 호출 사이의 현재 시각을 고정해야 한다.
    // fake timers로 Date를 고정한 뒤 두 번 호출한다. (DB CURRENT_TIMESTAMP는 영향받지 않음)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T19:00:00.000Z"));
    try {
      await ingestAuditEvent(wdb, event);
      // 두 번째 호출은 UNIQUE(dedupe_key) 충돌로 silent 무시되어야 한다 — 예외 없음
      await expect(ingestAuditEvent(wdb, event)).resolves.not.toThrow();
    } finally {
      vi.useRealTimers();
    }

    const rows = await wdb("audit_events").where("event_key", eventKey).select("id");
    expect(rows.length).toBe(1);
  });
});

describe("AuditEventModel 시각 구분", () => {
  test("occurred_at은 ingest() 호출 시 전달된 값이 저장되고 ingested_at은 DB CURRENT_TIMESTAMP로 별도 기록된다", async () => {
    const wdb = DB.getDB("w");
    const eventKey = `time-split-${Date.now()}`;

    // ingest()는 호출 시점의 new Date()를 occurred_at으로 사용한다 (프록시 수신 시점).
    // fake timers로 JS Date를 과거 시각으로 고정하면 occurred_at은 과거가 되고,
    // ingested_at은 DB CURRENT_TIMESTAMP로 별도 기록되므로 fake timer의 영향을 받지 않아
    // 두 컬럼이 서로 다른 값(시간)으로 저장됨을 확인할 수 있다.
    const frozenNow = new Date("2025-01-01T00:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(frozenNow);
    try {
      await ingestAuditEvent(wdb, {
        eventType: "user_created",
        eventKey,
        eventData: {
          identifier: "time@example.com",
        },
      });
    } finally {
      vi.useRealTimers();
    }

    const row = await wdb("audit_events")
      .where("event_key", eventKey)
      .first("occurred_at", "ingested_at");
    assert(row);

    const occurredAt = new Date(row.occurred_at);
    const ingestedAt = new Date(row.ingested_at);

    // occurred_at은 ingest() 호출 시점(=fake timer로 고정된 시각)과 동일
    expect(occurredAt.toISOString()).toBe(frozenNow.toISOString());

    // ingested_at은 DB CURRENT_TIMESTAMP로 기록되므로 fake timer의 영향을 받지 않는
    // 실제 현재 시각이어야 한다 (frozenNow보다 훨씬 미래)
    expect(ingestedAt.getTime()).toBeGreaterThan(frozenNow.getTime());

    // 두 컬럼은 서로 다른 시각으로 별도 기록되어야 한다
    expect(ingestedAt.getTime()).not.toBe(occurredAt.getTime());
  });
});
