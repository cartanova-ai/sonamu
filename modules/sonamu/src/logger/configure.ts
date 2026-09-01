import { configure, getConsoleSink } from "@logtape/logtape";
import {
  type Config,
  type Filter,
  type FilterLike,
  type LoggerConfig,
  type LogRecord,
  type Sink,
  type TextFormatter,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import { type FastifyReply, type FastifyRequest } from "fastify";

import { isSameCategory } from "./category";

interface ExternalLogTapeConfiguration {
  readonly config: Config<string, string>;
  applied: boolean;
}

declare global {
  var sonamuKitCliLogTapeOverride: ExternalLogTapeConfiguration | undefined;
}

function getExternalLogTapeConfiguration(): ExternalLogTapeConfiguration | undefined {
  return globalThis.sonamuKitCliLogTapeOverride;
}

export function hasExternalLogTapeConfiguration(): boolean {
  return getExternalLogTapeConfiguration() !== undefined;
}

export type SonamuLoggingOptions<TSinkId extends string, TFilterId extends string> = {
  // fastify 로깅 카테고리 (a.b.c의 형태로 넣으면 [a, b, c]로 들어갑니다.)
  // 기본값은 ["fastify"] 입니다.
  fastifyCategory?: readonly string[];

  // 각 항목들을 설정할 때 "fastify-console"이 들어갈 경우, 덮어씌워집니다.
  sinks?: Record<TSinkId, Sink>;
  filters?: Record<TFilterId, FilterLike>;

  // 각 항목을 설정할 때 fastifyCategory에 설정된 카테고리가 있을 경우, 기본 logger 설정은 추가되지 않습니다.
  loggers?: LoggerConfig<TSinkId, TFilterId>[];
};

// fastify에 대한 기본 sink 설정
function defaultFastifySink(fastifyCategory: readonly string[]): Sink {
  const fastifyFormatter = ((formatRecord: TextFormatter, record: LogRecord) => {
    // Fastify API Route에 대한 Logger의 경우, 응답 코드와 요청 URL을 추가
    const filterFastify = (
      request: FastifyRequest,
      requestRecord: LogRecord,
      responseCode?: number,
    ) => {
      if (!request.url.startsWith("/api")) {
        return formatRecord(requestRecord);
      }

      const lastItem = /* SAFETY: LogTape 구성 스키마가 이 값의 타입을 보장한다. */ requestRecord
        .message[requestRecord.message.length - 1] as string;
      return formatRecord({
        ...requestRecord,
        message: [
          ...requestRecord.message.slice(0, -1),
          `[${request.method}${responseCode ? `:${responseCode}` : ""}] ${request.originalUrl} - ${lastItem}`,
        ],
      });
    };

    if (!isSameCategory(fastifyCategory, [...record.category])) {
      return formatRecord(record);
    }

    if ("req" in record.properties && record.properties.req !== null) {
      const request = /* SAFETY: LogTape 구성 스키마가 이 값의 타입을 보장한다. */ record.properties
        .req as FastifyRequest;
      return filterFastify(request, record);
    }

    if ("res" in record.properties && record.properties.res !== null) {
      const reply = /* SAFETY: LogTape 구성 스키마가 이 값의 타입을 보장한다. */ record.properties
        .res as FastifyReply;
      return filterFastify(reply.request, record, reply.statusCode);
    }

    return formatRecord(record);
  }).bind(
    null,
    getPrettyFormatter({
      timestamp: "time",
      categoryWidth: 20,
      categoryTruncate: "middle",
    }),
  );

  return getConsoleSink({
    formatter: fastifyFormatter,
  });
}

// fastify에 대한 기본 filter 설정 (/api 경로의 요청만 로깅)
function defaultFastifyFilter(fastifyCategory: readonly string[]): Filter {
  return (record: LogRecord) => {
    if (!isSameCategory([...fastifyCategory], [...record.category])) {
      return false;
    }

    if ("req" in record.properties && record.properties.req !== null) {
      const request = /* SAFETY: LogTape 구성 스키마가 이 값의 타입을 보장한다. */ record.properties
        .req as FastifyRequest;
      return request.url.startsWith("/api") && request.url !== "/api/healthcheck";
    }

    if ("res" in record.properties && record.properties.res !== null) {
      const reply = /* SAFETY: LogTape 구성 스키마가 이 값의 타입을 보장한다. */ record.properties
        .res as FastifyReply;
      return reply.request.url.startsWith("/api") && reply.request.url !== "/api/healthcheck";
    }

    return true;
  };
}

// 전체 logtape 설정
export async function configureLogTape<TSinkId extends string, TFilterId extends string>(
  options: SonamuLoggingOptions<TSinkId, TFilterId>,
) {
  const external = getExternalLogTapeConfiguration();
  const fastifyCategory = options.fastifyCategory ?? ["fastify"];

  const sinks = {
    "fastify-console": defaultFastifySink(fastifyCategory),
    ...options.sinks,
    ...external?.config.sinks,
  };

  const filters = {
    "fastify-console": defaultFastifyFilter(fastifyCategory),
    ...options.filters,
    ...external?.config.filters,
  };

  const loggers = new Set<LoggerConfig<string, string>>([
    ...(external?.config.loggers ?? []),
    ...(options.loggers ?? []),
  ]);

  // logtape의 meta logger 표시를 비활성화
  loggers.add({
    category: ["logtape", "meta"],
    lowestLevel: "fatal",
  });

  if ([...loggers].every((logger) => !isSameCategory([...fastifyCategory], logger.category))) {
    loggers.add({
      category: [...fastifyCategory],
      sinks: ["fastify-console"],
      lowestLevel: "info",
      filters: ["fastify-console"],
    });
  }

  if (external !== undefined) external.applied = true;
  return configure({ sinks, filters, loggers: [...loggers], reset: true });
}
