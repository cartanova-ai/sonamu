import assert from "assert";

import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  NotFoundException,
} from "sonamu";
import { type ListResult } from "sonamu";

import { SD } from "../../i18n/sd.generated";
import { type AuditLogSubsetKey, type AuditLogSubsetMapping } from "../sonamu.generated";
import { auditLogLoaderQueries, auditLogSubsetQueries } from "../sonamu.generated.sso";
import { type AuditLogListParams, type AuditLogValue } from "./audit-log.types";

// log() 메서드 파라미터 타입
interface AuditLogParams {
  actor_id: string | null;
  action: "create" | "update" | "delete";
  entity_type: string;
  entity_id: number;
  old_value?: AuditLogValue | null;
  new_value?: AuditLogValue | null;
}

/*
  AuditLog Model
  - immutable: save/del API 없음
  - log()로 생성, findById/findMany로 조회
*/
class AuditLogModelClass extends BaseModelClass<
  AuditLogSubsetKey,
  AuditLogSubsetMapping,
  typeof auditLogSubsetQueries,
  typeof auditLogLoaderQueries
> {
  constructor() {
    super("AuditLog", auditLogSubsetQueries, auditLogLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "AuditLog" })
  async findById<T extends AuditLogSubsetKey>(
    subset: T,
    id: number,
  ): Promise<AuditLogSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(SD("notFound")(this.modelName, id));
    }

    return rows[0];
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "AuditLogs" })
  async findMany<T extends AuditLogSubsetKey, LP extends AuditLogListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, AuditLogSubsetMapping[T]>> {
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    } satisfies AuditLogListParams;

    const { qb } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("audit_logs.id", asArray(params.id));
    }

    // entity_type filter
    if (params.entity_type) {
      qb.where("audit_logs.entity_type", params.entity_type);
    }

    // actor_id filter
    if (params.actor_id) {
      qb.where("audit_logs.actor_id", params.actor_id);
    }

    // date_from / date_to filter
    if (params.date_from) {
      qb.where("audit_logs.created_at", ">=", params.date_from);
    }
    if (params.date_to) {
      qb.where("audit_logs.created_at", "<=", params.date_to);
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("audit_logs.id", Number(params.keyword));
      } else {
        throw new BadRequestException(SD("search.invalidField")(params.search));
      }
    }

    // orderBy — 기본 정렬: created_at DESC (최신순)
    if (params.orderBy) {
      if (params.orderBy === "id-desc") {
        qb.orderBy("audit_logs.id", "desc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    return this.executeSubsetQuery({
      subset,
      qb,
      params,
    });
  }

  /**
   * 감사 로그 1건 생성 (내부 전용, API 미노출)
   * 대상 Model의 save/del에서 호출
   * 실패해도 원래 작업을 중단시키지 않음
   */
  async log(params: AuditLogParams): Promise<number | null> {
    try {
      const wdb = this.getPuri("w");

      const [result] = await wdb
        .table("audit_logs")
        .insert({
          actor_id: params.actor_id,
          action: params.action,
          entity_type: params.entity_type,
          entity_id: params.entity_id,
          old_value: params.old_value ?? null,
          new_value: params.new_value ?? null,
          created_at: new Date(),
        })
        .returning("id");

      assert(result);
      return result.id;
    } catch {
      // 감사 로그 기록 실패 시 원래 작업은 성공 처리
      console.error("[AuditLog] 감사 로그 기록 실패:", params);
      return null;
    }
  }
}

export const AuditLogModel = new AuditLogModelClass();
