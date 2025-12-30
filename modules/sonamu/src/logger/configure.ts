import {
  configure,
  type Filter,
  type FilterLike,
  getConsoleSink,
  type LoggerConfig,
  type LogRecord,
  type Sink,
  type TextFormatter,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import type { FastifyReply, FastifyRequest } from "fastify";
import { isSameCategory } from "./category";

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
  const formatter = ((formatter: TextFormatter, record: LogRecord) => {
    // Fastify API Logger의 경우, 응답 코드와 요청 URL을 추가
    const filterFastify = (request: FastifyRequest, record: LogRecord, responseCode?: number) => {
      if (!request.url.startsWith("/api")) {
        return formatter(record);
      }

      const lastItem = record.message[record.message.length - 1] as string;
      return formatter({
        ...record,
        message: [
          ...record.message.slice(0, -1),
          `[${request.method}${responseCode ? `:${responseCode}` : ""}] ${request.originalUrl} - ${lastItem}`,
        ],
      });
    };

    if (!isSameCategory(fastifyCategory, [...record.category])) {
      return formatter(record);
    }

    if ("req" in record.properties && record.properties.req !== null) {
      const request = record.properties.req as FastifyRequest;
      return filterFastify(request, record);
    }

    if ("res" in record.properties && record.properties.res !== null) {
      const reply = record.properties.res as FastifyReply;
      return filterFastify(reply.request, record, reply.statusCode);
    }

    return formatter(record);
  }).bind(
    null,
    getPrettyFormatter({
      timestamp: "time",
      categoryWidth: 20,
      categoryTruncate: "middle",
    }),
  );

  return getConsoleSink({
    formatter,
  });
}

// fastify에 대한 기본 filter 설정 (/api 경로의 요청만 로깅)
function defaultFastifyFilter(fastifyCategory: readonly string[]): Filter {
  return (record: LogRecord) => {
    if (!isSameCategory([...fastifyCategory], [...record.category])) {
      return false;
    }

    if ("req" in record.properties && record.properties.req !== null) {
      const request = record.properties.req as FastifyRequest;
      return request.url.startsWith("/api");
    }

    if ("res" in record.properties && record.properties.res !== null) {
      const reply = record.properties.res as FastifyReply;
      return reply.request.url.startsWith("/api");
    }

    return true;
  };
}

// 전체 logtape 설정
export async function configureLogTape<TSinkId extends string, TFilterId extends string>(
  options: SonamuLoggingOptions<TSinkId, TFilterId>,
) {
  const fastifyCategory = options.fastifyCategory ?? ["fastify"];

  const sinks = {
    "fastify-console": defaultFastifySink(fastifyCategory),
    ...(options.sinks ?? {}),
  } as Record<TSinkId | "fastify-console", Sink>;

  const filters = {
    "fastify-console": defaultFastifyFilter(fastifyCategory),
    ...(options.filters ?? {}),
  } as Record<TFilterId | "fastify-console", FilterLike>;

  const loggers: Set<LoggerConfig<TSinkId | "fastify-console", TFilterId | "fastify-console">> =
    new Set(options.loggers ?? []);

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

  return configure({ sinks, filters, loggers: [...loggers], reset: true });
}
