import { join } from "path";

import { Naite, Sonamu } from "sonamu";
import { bootstrap, exists, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);
describe("Mocks Testing", () => {
  describe("fs/promises", () => {
    test("access", async () => {
      const apiRootPath = join(Sonamu.appRootPath, "api");

      // 실존 ✅ / VFS 등록 ❌
      const isExistsInReal = await exists(join(apiRootPath, "src/application/user/user.model.ts"));
      expect(isExistsInReal).toBe(true);

      // 실존 ❌ / VFS 등록 ✅
      const virtualPath = join(apiRootPath, "ThisFileIsNotExists__ButShouldBeExistsInMock.ts");
      Naite.t(`mock:fs/promises:virtualFileSystem`, virtualPath);
      const isExists = await exists(virtualPath);
      expect(isExists).toBe(true);

      // 실존 ❌ / VFS 등록 ❌
      const isNotExists = await exists(join(apiRootPath, "ThisFileIsNotExists.ts"));
      expect(isNotExists).toBe(false);

      // VFS 등록 경로를 삭제한 후 재확인: 실존 ❌ / VFS 등록 ❌
      Naite.del(`mock:fs/promises:virtualFileSystem`);
      const isExistsAfterDelete = await exists(virtualPath);
      expect(isExistsAfterDelete).toBe(false);
    });
  });
});
