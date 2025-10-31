import {
  BaseModelClass,
  ListResult,
  asArray,
  NotFoundException,
  BadRequestException,
  api,
  upload,
  Sonamu,
} from "sonamu";
import { FileSubsetKey, FileSubsetMapping } from "../sonamu.generated";
import { fileSubsetQueries } from "../sonamu.generated.sso";
import { FileListParams, FileSaveParams } from "./file.types";

/*
  File Model
*/
class FileModelClass extends BaseModelClass {
  modelName = "File";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "File" })
  async findById<T extends FileSubsetKey>(
    subset: T,
    id: number
  ): Promise<FileSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(`존재하지 않는 File ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends FileSubsetKey>(
    subset: T,
    listParams: FileListParams
  ): Promise<FileSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Files" })
  async findMany<T extends FileSubsetKey>(
    subset: T,
    params: FileListParams = {}
  ): Promise<ListResult<FileSubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "id",
      orderBy: "id-desc",
      ...params,
    };

    // build queries
    let { rows, total } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: fileSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("files.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("files.id", params.keyword);
            // } else if (params.search === "field") {
            //   qb.where("files.field", "like", `%${params.keyword}%`);
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
          qb.orderBy("files." + orderByField, orderByDirec);
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
  async save(spa: FileSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.map((sp) => {
      wdb.ubRegister("files", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("files");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("files").whereIn("files.id", ids).delete();
    });

    return ids.length;
  }

  @api({ httpMethod: "POST", clients: ["axios-multipart"] })
  @upload()
  async upload(): Promise<{
    file: { name: string; url: string; mime_type: string };
  }> {
    const { file } = Sonamu.getUploadContext();
    if (file === undefined) {
      throw new BadRequestException("파일 업로드되지 않음");
    }

    const md5 = await file.md5();
    const key = `${md5}.${file.extname}`;

    const url = await file.saveToDisk(key);

    console.log("clientName", file.clientName);
    console.log("filename", file.filename);
    console.log("fieldName", file.fieldName);
    console.log("size", file.size);
    console.log("extname", file.extname);
    console.log("mimetype", file.mimetype);
    console.log("md5", md5);

    return {
      file: {
        name: file.clientName,
        url,
        mime_type: file.mimetype,
      },
    };
  }
}

export const FileModel = new FileModelClass();
