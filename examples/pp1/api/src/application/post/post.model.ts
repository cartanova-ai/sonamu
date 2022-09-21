import {
  BaseModelClass,
  api,
  NotFoundException,
  ListResult,
  asArray,
  BadRequestException,
  Context,
  UnauthorizedException,
} from "sonamu";
import {
  PostSubsetKey,
  PostSubsetMapping,
  postSubsetQueries,
} from "./post.generated";
import { PostListParams, PostSaveParams } from "./post.types";

/*
  포스트 모델
*/
class PostModelClass extends BaseModelClass {
  modelName = "Post";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Post" })
  async findById<T extends PostSubsetKey>(
    subset: T,
    id: number
  ): Promise<PostSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (rows.length == 0) {
      throw new NotFoundException(`존재하지 않는 포스트ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends PostSubsetKey>(
    subset: T,
    listParams: PostListParams
  ): Promise<PostSubsetMapping[T] | undefined> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0];
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Posts" })
  async findMany<T extends PostSubsetKey>(
    subset: T,
    params: PostListParams = {}
  ): Promise<ListResult<PostSubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "title",
      orderBy: "id-desc",
      ...params,
    };

    // build queries
    let { rows, total, subsetQuery } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: postSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("posts.id", asArray(params.id));
        }
        // type
        if (params.type) {
          qb.whereIn("posts.type", asArray(params.type));
        }
        // status
        if (params.status) {
          qb.whereIn("posts.status", asArray(params.status));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "title") {
            qb.where("posts.title", "like", `%${params.keyword}%`);
          } else if (params.search === "content") {
            qb.where("posts.content", "like", `%${params.keyword}%`);
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
          qb.orderBy("posts." + orderByField, orderByDirec);
        }

        return qb;
      },
      debug: false,
    });

    // extend with virtual (example)
    if (subsetQuery.virtual.includes("next_post")) {
      // rows = rows.map((row) => {
      //   row.next_post = {
      //     a: "a",
      //     b: 1,
      //     c: new Date(),
      //   };
      //   return row;
      // });
    }

    return {
      rows,
      total,
    };
  }

  @api({ httpMethod: "POST" })
  async save(
    saveParamsArray: PostSaveParams[],
    { user }: Context
  ): Promise<number[]> {
    if (user === null) {
      throw new UnauthorizedException("글 작성은 로그인 후 사용 가능합니다.");
    }

    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    saveParamsArray.map((saveParams) => {
      ub.register("posts", {
        ...saveParams,
        author_id: user.id,
        images: JSON.stringify(saveParams.images),
      });
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const postIds = await ub.upsert(trx, "posts");

      return postIds;
    });
  }

  @api({ httpMethod: "GET" })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("posts").whereIn("posts.id", ids).delete();
    });

    return ids.length;
  }

  @api({ httpMethod: "POST" })
  async like(id: number, _context: Context): Promise<number> {
    return id;
  }
}

export const PostModel = new PostModelClass();
