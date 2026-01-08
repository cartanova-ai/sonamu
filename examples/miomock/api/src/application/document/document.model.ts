import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  type ExtractTTables,
  exhaustive,
  type ListResult,
  NotFoundException,
  type VectorColumns,
} from "sonamu";
import { Embedding } from "sonamu/vector";
import { SD } from "../../i18n/sd.generated";
import type { DocumentSubsetKey, DocumentSubsetMapping } from "../sonamu.generated";
import { documentLoaderQueries, documentSubsetQueries } from "../sonamu.generated.sso";
import type {
  DocumentListParams,
  DocumentSaveParams,
  DocumentSemanticParams,
} from "./document.types";

/*
  Document Model
*/
class DocumentModelClass extends BaseModelClass<
  DocumentSubsetKey,
  DocumentSubsetMapping,
  typeof documentSubsetQueries,
  typeof documentLoaderQueries
> {
  constructor() {
    super("Document", documentSubsetQueries, documentLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Document" })
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
      throw new NotFoundException(SD("notFound")(this.modelName, id));
    }

    return rows[0];
  }

  async findOne<T extends DocumentSubsetKey>(
    subset: T,
    listParams: DocumentListParams,
  ): Promise<DocumentSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      queryMode: "list",
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
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
    } satisfies DocumentListParams;

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
        throw new BadRequestException(SD("search.invalidField")(params.search));
      }
    }

    // semanticQuery
    if (params.semanticQuery) {
      const { embedding, ...options } = params.semanticQuery;
      const which = params.which;
      const targetColumn: VectorColumns<ExtractTTables<typeof qb>> = (() => {
        if (which === "title") {
          // title이면 title 컬럼 사용
          return "documents.title_content_embedding" as const;
        } else if (which === "content") {
          // content이면 content 컬럼 사용
          return "documents.title_content_embedding" as const;
        }
        throw new BadRequestException(`Invalid which: ${which}`);
      })();

      qb.vectorSimilarity(targetColumn, embedding, options);
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

  @api({
    httpMethod: "POST",
    clients: ["axios", "tanstack-query"],
    resourceName: "SimilarDocumentsByVector",
  })
  async findManySemanticByVector<T extends DocumentSubsetKey>(
    subset: T,
    params: DocumentSemanticParams,
  ): Promise<{ rows: (DocumentSubsetMapping[T] & { similarity: number })[] }> {
    return this.findMany(subset, {
      ...params,
      queryMode: "list",
    });
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async embedQuery(
    text: string,
    model: "voyage" | "openai",
    inputType: "document" | "query",
  ): Promise<number[]> {
    const queryResult = await Embedding.embedOne(text, model, inputType);

    return queryResult.embedding;
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
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

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("documents").whereIn("documents.id", ids).delete();
    });

    return ids.length;
  }
}

export const DocumentModel = new DocumentModelClass();
