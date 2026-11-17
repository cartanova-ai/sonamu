import { type FastifyInstance } from "fastify";
import { z } from "zod";

import { Sonamu } from "../api/sonamu";
import { SD } from "../dict/sd";
import { sonamuDictionary } from "../dict/sonamu-dictionary";
import { EntityManager } from "../entity/entity-manager";
import {
  BadRequestException,
  isSoException,
  ServiceUnavailableException,
} from "../exceptions/so-exceptions";
import { TemplateManager } from "../template/template-manager";
import { type PathAndCode } from "../types/types";
import { nonNullable } from "../utils/utils";
import { forwardAsyncErrors } from "./async-route";

/**
 * Sonamu UI 스캐폴딩에서 생성할 수 있는 템플릿 키입니다.
 * entity·generated 같은 동기화용 템플릿은 엔티티 정의나 생성 코드 전체를 덮어쓰므로 받지 않습니다.
 */
export const ScaffoldingTemplateKey = z.enum([
  "model",
  "model_test",
  "view_list",
  "view_search_input",
  "view_form",
  "view_id_all_select",
]);
export type ScaffoldingTemplateKey = z.infer<typeof ScaffoldingTemplateKey>;

/**
 * createEntity와 같은 entityId 규칙입니다.
 * 경로 구분자·`..`·따옴표가 생성 파일 경로나 생성 코드에 들어가지 않게 합니다.
 */
const ScaffoldingEntityId = z.string().regex(/^[A-Z][a-zA-Z0-9]*$/);

const ScaffoldingOption = z.object({
  entityId: ScaffoldingEntityId,
  templateKey: ScaffoldingTemplateKey,
});

const ScaffoldingGetStatusBody = z.object({
  entityIds: z.array(ScaffoldingEntityId),
  templateKeys: z.array(ScaffoldingTemplateKey),
});

const ScaffoldingGenerateBody = z.object({
  options: z.array(ScaffoldingOption.extend({ overwrite: z.boolean().optional() })),
});

const ScaffoldingPreviewBody = z.object({
  option: ScaffoldingOption,
});

/** 요청 본문을 스키마로 검증하고, 형식이 어긋나면 어떤 파일도 건드리기 전에 400으로 거부합니다. */
function parseScaffoldingBody<Schema extends z.ZodType>(
  schema: Schema,
  body: Parameters<Schema["safeParse"]>[0],
): z.infer<Schema> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(SD("error.badRequest"), result.error.issues);
  }
  return result.data;
}

/** 등록되지 않은 엔티티로는 스캐폴딩 파일을 만들거나 경로를 조회하지 않습니다. */
function assertRegisteredEntity(entityId: string): void {
  if (!EntityManager.exists(entityId)) {
    throw new BadRequestException(SD("error.targetNotFound"));
  }
}

/** Sonamu UI의 스캐폴딩(상태 조회·생성·미리보기) API를 등록합니다. */
export async function registerScaffoldingApi(server: FastifyInstance) {
  server.post("/api/scaffolding/getStatus", (request) =>
    forwardAsyncErrors(async () => {
      const { entityIds, templateKeys: requestedTemplateKeys } = parseScaffoldingBody(
        ScaffoldingGetStatusBody,
        request.body,
      );
      if (entityIds.length === 0) {
        throw new BadRequestException(SD("sonamu.error.entityIdsRequired"));
      } else if (requestedTemplateKeys.length === 0) {
        throw new BadRequestException(SD("sonamu.error.templateKeysRequired"));
      }
      entityIds.forEach(assertRegisteredEntity);

      // sorting
      entityIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const templateKeys = ScaffoldingTemplateKey.options.filter((tk) =>
        requestedTemplateKeys.includes(tk),
      );

      const combinations = entityIds.flatMap((entityId) => {
        return templateKeys.map((templateKey) => [entityId, templateKey] as const);
      });

      const statuses = await Promise.all(
        combinations.map(async ([entityId, templateKey]) => {
          const { subPath, fullPath, isExists } = await Sonamu.syncer.checkExistsGenCode(
            entityId,
            templateKey,
          );
          return {
            entityId,
            templateKey,
            subPath,
            fullPath,
            isExists,
          };
        }),
      );
      return { statuses };
    }),
  );

  server.post("/api/scaffolding/generate", (request) =>
    forwardAsyncErrors(async () => {
      const { options } = parseScaffoldingBody(ScaffoldingGenerateBody, request.body);
      if (options.length === 0) {
        throw new BadRequestException(SD("sonamu.error.optionsRequired"));
      }
      // 하나라도 잘못된 항목이 있으면 아무 파일도 만들지 않도록 생성 전에 전부 확인한다.
      options.forEach(({ entityId }) => assertRegisteredEntity(entityId));

      // 1. 모든 템플릿에서 필요한 dict 키를 수집
      const keys = options.flatMap(({ templateKey }) => {
        const template = TemplateManager.get(templateKey);
        return template.getRequiredDictKeys() ?? [];
      });

      // 2. target별로 ensureDictKeys 호출 (순차 처리)
      await sonamuDictionary.ensureDictKeys([...new Set(keys)]);

      // 3. 템플릿 생성 (병렬 처리)
      const result = await Promise.all(
        options.map(async ({ entityId, templateKey, overwrite }) => {
          try {
            return await Sonamu.syncer.generateTemplate(templateKey, { entityId }, { overwrite });
          } catch (e) {
            if (isSoException(e) && e.statusCode === 541) {
              return null;
            } else {
              console.error(e);
              throw e;
            }
          }
        }),
      );

      if (result.filter(nonNullable).length === 0) {
        throw new ServiceUnavailableException(SD("sonamu.error.allFilesGenerated"));
      }
      return result;
    }),
  );

  server.post("/api/scaffolding/preview", (request): Promise<{ pathAndCodes: PathAndCode[] }> =>
    forwardAsyncErrors(async () => {
      const {
        option: { entityId, templateKey },
      } = parseScaffoldingBody(ScaffoldingPreviewBody, request.body);
      assertRegisteredEntity(entityId);

      try {
        const pathAndCodes = await Sonamu.syncer.renderTemplate(templateKey, { entityId });

        return { pathAndCodes };
      } catch (e) {
        console.error(e);
        throw e;
      }
    }),
  );
}
