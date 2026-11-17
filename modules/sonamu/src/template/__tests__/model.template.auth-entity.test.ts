import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { setSDConfig } from "../../dict/sd";
import { Entity } from "../../entity/entity";
import { EntityManager } from "../../entity/entity-manager";
import { BadRequestException } from "../../exceptions/so-exceptions";
import { Template__model } from "../implementations/model.template";

function mockEntity(id: string, table: string) {
  // render는 거부 판단에 id와 table만 사용한다.
  const entity = new Entity({ id, table, props: [], indexes: [], subsets: {}, enums: {} });
  vi.spyOn(EntityManager, "exists").mockReturnValue(true);
  vi.spyOn(EntityManager, "get").mockReturnValue(entity);
}

describe("Template__model better-auth 자격 증명 엔티티 스캐폴드 거부", () => {
  beforeAll(() => {
    setSDConfig({ defaultLocale: "ko", supportedLocales: ["ko"] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
  ])("%s 모델은 가드 없는 API를 만들지 않고 거부한다", async (entityId, table) => {
    mockEntity(entityId, table);

    const rendering = new Template__model().render({ entityId });

    await expect(rendering).rejects.toBeInstanceOf(BadRequestException);
    await expect(rendering).rejects.toThrow(entityId);
  });
});
