import {
  BaseModelClass,
  type ListResult,
  asArray,
  NotFoundException,
  BadRequestException,
  api,
  exhaustive,
} from "sonamu";

import { SD } from "../../i18n/sd.generated";
import {
  type AuditEventCategory,
  type AuditEventSubsetKey,
  type AuditEventSubsetMapping,
} from "../sonamu.generated";
import { auditEventSubsetQueries, auditEventLoaderQueries } from "../sonamu.generated.sso";
import { type AuditEventListParams, type AuditEventSaveParams } from "./audit-event.types";

/*
  AuditEvent Model
  - ingest() 로직은 sonamu 패키지 내부(auth.plugins에 sonamuAuditLog() 등록 시)에서 자동 처리됩니다.
  - 이 모델은 audit_events 조회/관리 API를 제공합니다.
*/

class AuditEventModelClass extends BaseModelClass<
  AuditEventSubsetKey,
  AuditEventSubsetMapping,
  typeof auditEventSubsetQueries,
  typeof auditEventLoaderQueries
> {
  constructor() {
    super("AuditEvent", auditEventSubsetQueries, auditEventLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "AuditEvent" })
  async findById<T extends AuditEventSubsetKey>(
    subset: T,
    id: number,
  ): Promise<AuditEventSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(SD("notFound")("AuditEvent", id));
    }

    return rows[0];
  }

  async findOne<T extends AuditEventSubsetKey>(
    subset: T,
    listParams: AuditEventListParams,
  ): Promise<AuditEventSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "AuditEvents" })
  async findMany<T extends AuditEventSubsetKey, LP extends AuditEventListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, AuditEventSubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    } satisfies AuditEventListParams;

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("audit_events.id", asArray(params.id));
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("audit_events.id", Number(params.keyword));
      } else {
        throw new BadRequestException(SD("search.invalidField")(params.search));
      }
    }

    // orderBy
    if (params.orderBy) {
      if (params.orderBy === "id-desc") {
        qb.orderBy("audit_events.id", "desc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    const enhancers = this.createEnhancers({
      A: (row) => ({
        ...row,
      }),
    });

    return this.executeSubsetQuery({
      subset,
      qb,
      params,
      enhancers,
      debug: false,
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async save(spa: AuditEventSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("audit_events", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("audit_events");

      return ids;
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("audit_events").whereIn("audit_events.id", ids).delete();
    });

    return ids.length;
  }
}

export const AuditEventModel = new AuditEventModelClass();
export type { AuditEventCategory };
