import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  type ListResult,
  NotFoundException,
} from "sonamu";
import type { DocumentSubsetKey, DocumentSubsetMapping } from "../sonamu.generated";
import { documentLoaderQueries, documentSubsetQueries } from "../sonamu.generated.sso";
import type { DocumentListParams, DocumentSaveParams } from "./document.types";

/*
  Document Model
*/
class DocumentModelClass extends BaseModelClass<
  DocumentSubsetKey,
  DocumentSubsetMapping,
  typeof documentSubsetQueries,
  typeof documentLoaderQueries
> {
  modelName = "Document";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Document" })
  async findById<T extends DocumentSubsetKey>(
    subset: T,
    id: number,
  ): Promise<DocumentSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(`존재하지 않는 Document ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends DocumentSubsetKey>(
    subset: T,
    listParams: DocumentListParams,
  ): Promise<DocumentSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Documents" })
  async findMany<T extends DocumentSubsetKey, LP extends DocumentListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, DocumentSubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    };

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("documents.id", asArray(params.id));
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("documents.id", Number(params.keyword));
        // } else if (params.search === "field") {
        //   qb.where("documents.field", "like", `%${params.keyword}%`);
      } else {
        throw new BadRequestException(`구현되지 않은 검색 필드 ${params.search}`);
      }
    }

    // orderBy
    if (params.orderBy) {
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("documents.id", "desc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    const enhancers = this.createEnhancers({
      A: (row) => ({
        ...row,
        // 서브셋별로 virtual 필드 계산로직 추가
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

  @api({ httpMethod: "POST" })
  async save(spa: DocumentSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("documents", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("documents");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("documents").whereIn("documents.id", ids).delete();
    });

    return ids.length;
  }
}

export const DocumentModel = new DocumentModelClass(documentSubsetQueries, documentLoaderQueries);
