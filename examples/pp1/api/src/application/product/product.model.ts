import { BaseModelClass } from "@sonamu/core";
import { ListResult, asArray } from "@sonamu/core";
import { NotFoundException, BadRequestException } from "@sonamu/core";
import {
  ProductSubsetKey,
  ProductSubsetMapping,
  productSubsetQueries,
} from "./product.generated";
import { ProductListParams, ProductSaveParams } from "./product.types";
import { api } from "@sonamu/core";

/*
  Product Model
*/
class ProductModelClass extends BaseModelClass {
  modelName = "Product";

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
    resourceName: "Product",
  })
  async findById<T extends ProductSubsetKey>(
    subset: T,
    id: number
  ): Promise<ProductSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (rows.length == 0) {
      throw new NotFoundException(`존재하지 않는 Product ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends ProductSubsetKey>(
    subset: T,
    listParams: ProductListParams
  ): Promise<ProductSubsetMapping[T] | undefined> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0];
  }

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
    resourceName: "Products",
  })
  async findMany<T extends ProductSubsetKey>(
    subset: T,
    params: ProductListParams = {}
  ): Promise<ListResult<ProductSubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "title",
      orderBy: "id-desc",
      ...params,
    };

    // build queries
    let { rows, total } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: productSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("products.id", asArray(params.id));
        }
        // type
        if (params.type) {
          qb.whereIn("products.type", asArray(params.type));
        }
        // status
        if (params.status) {
          qb.whereIn("products.status", asArray(params.status));
        }
        // brand_id
        if (params.brand_id) {
          qb.whereIn("products.brand_id", asArray(params.brand_id));
        }
        // tag_id
        if (params.tag_id) {
          qb.join("products__tags", "products.id", "products__tags.product_id");
          qb.whereIn("products__tags.tag_id", asArray(params.tag_id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "title") {
            qb.where("products.title", "like", `%${params.keyword}%`);
          } else {
            throw new BadRequestException(
              `구현되지 않은 검색 필드 ${params.search}`
            );
          }
        }

        // orderBy
        if (params.orderBy) {
          // default orderBy
          const [orderByField, orderByDirec] = params.orderBy.split("-");
          qb.orderBy("products." + orderByField, orderByDirec);
        }

        return qb;
      },
      debug: false,
    });

    return {
      rows,
      total,
    };
  }

  @api({ httpMethod: "POST" })
  async save(saveParamsArray: ProductSaveParams[]): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    saveParamsArray.map((saveParams) => {
      const { images, tags, ...sp } = saveParams;
      const product_id = ub.register("products", {
        ...sp,
        images: JSON.stringify(images),
      });

      tags.map((tag) => {
        const tag_id = ub.register("tags", tag);
        ub.register("products__tags", {
          product_id,
          tag_id,
        });
      });
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const productIds = await ub.upsert(trx, "products");
      await ub.upsert(trx, "tags");
      const tagJoinIds = await ub.upsert(trx, "products__tags");
      await trx("products__tags")
        .whereIn("product_id", productIds)
        .whereNotIn("id", tagJoinIds)
        .delete();

      return productIds;
    });
  }

  @api({ httpMethod: "GET" })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("products").whereIn("products.id", ids).delete();
    });

    return ids.length;
  }
}

export const ProductModel = new ProductModelClass();
