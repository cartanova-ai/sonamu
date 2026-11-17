import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

import { type FastifyInstance } from "fastify";

import { Sonamu } from "../api/sonamu";
import { SD } from "../dict/sd";
import { EntityManager } from "../entity/entity-manager";
import { BadRequestException } from "../exceptions/so-exceptions";
import { forwardAsyncErrors } from "./async-route";
import { requireSameOriginUIRequest } from "./ui-request-guard";

/**
 * openVscode가 받은 absPath를 앱 루트 아래에 실제로 있는 파일의 경로로 확정합니다.
 * 심볼릭 링크나 `..`로 앱 루트를 벗어나는 경로, 없는 경로, 디렉터리는 거부합니다.
 */
function resolveOpenVscodeAbsPath(absPath: string): string {
  const appRootPath = fs.realpathSync(Sonamu.appRootPath);
  const realPath = (() => {
    try {
      return fs.realpathSync(path.resolve(appRootPath, absPath));
    } catch {
      throw new BadRequestException(SD("error.badRequest"));
    }
  })();

  const relativePath = path.relative(appRootPath, realPath);
  const isInsideAppRoot =
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath);
  if (!isInsideAppRoot || !fs.statSync(realPath).isFile()) {
    throw new BadRequestException(SD("error.badRequest"));
  }
  return realPath;
}

/** 엔티티 파일이나 지정한 경로를 VS Code로 여는 Sonamu UI 도구 API를 등록합니다. */
export async function registerOpenVscodeApi(server: FastifyInstance) {
  // 프로세스를 실행하는 라우트는 동일 출처 JSON POST만 받습니다.
  server.post<{
    Body: {
      entityId?: string;
      preset?: "types" | "entity.json" | "generated";
      absPath?: string;
    };
  }>("/api/tools/openVscode", { onRequest: requireSameOriginUIRequest }, (request) =>
    forwardAsyncErrors(async () => {
      const { entityId, preset, absPath } = request.body;

      const targetPath = (() => {
        if (entityId && preset) {
          const entity = EntityManager.get(entityId);
          const { names } = entity;

          const { apiRootPath } = Sonamu;
          const filename = (() => {
            switch (preset) {
              case "types":
                return `${names.fs}.types.ts`;
              case "entity.json":
                return `${names.fs}.entity.json`;
              case "generated":
                return `${names.fs}.generated.ts`;
            }
            return undefined;
          })();
          return `${apiRootPath}/src/application/${entity.names.parentFs}/${filename}`;
        } else {
          if (!absPath) {
            throw new BadRequestException(SD("sonamu.error.presetOrAbsPathRequired"));
          }
          return resolveOpenVscodeAbsPath(absPath);
        }
      })();
      // 셸을 거치지 않고 경로를 `--` 뒤에 두어, 명령이나 code 옵션으로 해석되지 않도록 합니다.
      execFileSync("code", ["--", targetPath]);
    }),
  );
}
