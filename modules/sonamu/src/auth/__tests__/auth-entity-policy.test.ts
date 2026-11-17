import { describe, expect, it } from "vitest";

import { getSubsetFields, normalizeSubsetField } from "../../types/types";
import {
  BETTER_AUTH_SECRET_FIELDS,
  findBetterAuthCredentialEntity,
  getAllBetterAuthEntityDefinitions,
} from "../auth-entity-policy";

describe("better-auth 자격 증명 엔티티 정책", () => {
  const definitions = getAllBetterAuthEntityDefinitions();

  it("비밀 필드 목록의 엔티티와 필드는 모두 실제 better-auth 정의에 존재한다", () => {
    for (const [entityId, fields] of Object.entries(BETTER_AUTH_SECRET_FIELDS)) {
      const definition = definitions.find((entity) => entity.id === entityId);
      expect(definition, entityId).toBeDefined();
      const propNames = definition?.props?.map((prop) => prop.name) ?? [];
      for (const field of fields) {
        expect(propNames, `${entityId}.${field}`).toContain(field);
      }
    }
  });

  it("기본 subset에는 비밀 필드가 들어가지 않는다", () => {
    const leaked = definitions.flatMap((definition) => {
      const secretFields: readonly string[] =
        Object.entries(BETTER_AUTH_SECRET_FIELDS).find(([id]) => id === definition.id)?.[1] ?? [];
      return Object.entries(definition.subsets ?? {}).flatMap(([subsetKey, subsetDef]) =>
        getSubsetFields(subsetDef)
          .map(normalizeSubsetField)
          .filter((field) => secretFields.includes(field))
          .map((field) => `${definition.id}.${subsetKey}.${field}`),
      );
    });
    expect(leaked).toEqual([]);
  });

  it.each([
    ["Session", "sessions"],
    ["Account", "accounts"],
    ["Verification", "verifications"],
    ["TwoFactor", "two_factors"],
    ["Passkey", "passkeys"],
    ["Jwks", "jwks"],
    ["ApiKey", "api_keys"],
    ["SsoProvider", "sso_providers"],
  ])("%s(%s)는 자격 증명 엔티티로 판단한다", (id, table) => {
    expect(findBetterAuthCredentialEntity({ id, table })?.id).toBe(id);
  });

  it.each([
    ["User", "users"],
    ["Organization", "organizations"],
    ["AuditEvent", "audit_events"],
    ["Session", "conference_sessions"],
  ])("%s(%s)는 자격 증명 엔티티로 판단하지 않는다", (id, table) => {
    expect(findBetterAuthCredentialEntity({ id, table })).toBeUndefined();
  });
});
