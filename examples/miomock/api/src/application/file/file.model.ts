import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  type ListResult,
  NotFoundException,
  Sonamu,
  type SonamuFile,
  upload,
} from "sonamu";
import { SD } from "../../i18n/sd.generated";
import type { FileSubsetKey, FileSubsetMapping } from "../sonamu.generated";
import { fileLoaderQueries, fileSubsetQueries } from "../sonamu.generated.sso";
import type { FileListParams, FileSaveParams } from "./file.types";

/*
  File Model
*/
class FileModelClass extends BaseModelClass<
  FileSubsetKey,
  FileSubsetMapping,
  typeof fileSubsetQueries,
  typeof fileLoaderQueries
> {
  constructor() {
    super("File", fileSubsetQueries, fileLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "File" })
  async findById<T extends FileSubsetKey>(subset: T, id: number): Promise<FileSubsetMapping[T]> {
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

  async findOne<T extends FileSubsetKey>(
    subset: T,
    listParams: FileListParams,
  ): Promise<FileSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Files" })
  async findMany<T extends FileSubsetKey, LP extends FileListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, FileSubsetMapping[T]>> {
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    };
    // params with defaults

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    if (params.id) {
      // id
      qb.whereIn("files.id", asArray(params.id));
    }

    if (params.search && params.keyword && params.keyword.length > 0) {
      // search-keyword
      if (params.search === "id") {
        qb.where("files.id", Number(params.keyword));
        // } else if (params.search === "field") {
        //   qb.where("files.field", "like", `%${params.keyword}%`);
      } else {
        throw new BadRequestException(SD("search.invalidField")(params.search));
      }
    }

    if (params.orderBy) {
      // orderBy
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("files.id", "desc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    return this.executeSubsetQuery({
      subset,
      qb,
      params,
      debug: false,
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async save(spa: FileSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    for (const sp of spa) {
      wdb.ubRegister("files", sp);
    }

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("files");

      return ids;
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("files").whereIn("files.id", ids).delete();
    });

    return ids.length;
  }

  @upload({ limits: { files: 10 } })
  async upload(): Promise<{
    files: SonamuFile[];
  }> {
    const { files: _files } = Sonamu.getContext();

    console.log("files", _files);
    if (!_files || _files.length === 0) {
      throw new BadRequestException(SD("file.uploadFailed"));
    }

    const files = await Promise.all(
      _files.map(async (file) => {
        const md5 = await file.md5();
        const key = `${md5}.${file.extname}`;
        return {
          name: file.filename,
          url: await file.saveToDisk(key),
          mime_type: file.mimetype,
          size: file.size,
        };
      }),
    );

    return {
      files,
    };
  }

  @upload({ limits: { files: 5 } })
  async inlineUpload(params: { category: string }): Promise<{
    category: string;
    files: SonamuFile[];
  }> {
    const { files } = Sonamu.getContext();
    const { category } = params;

    if (!files || files.length === 0) {
      throw new BadRequestException(SD("file.uploadFailed"));
    }

    console.log("files를 원하는 로직으로 처리해주세요", files);

    return {
      category,
      files: await Promise.all(
        files.map(async (file) => ({
          name: file.filename,
          url: await file.saveToDisk(`${category}/${await file.md5()}`),
          mime_type: file.mimetype,
          size: file.size,
        })),
      ),
    };
  }

  @upload({ limits: { files: 1 } })
  async inlineUploadFlat(category: string): Promise<{
    category: string;
    files: { name: string; url: string; mime_type: string; size: number }[];
  }> {
    const { files } = Sonamu.getContext();
    if (!files || files.length === 0) {
      throw new BadRequestException(SD("file.uploadFailed"));
    }

    return {
      category,
      files: await Promise.all(
        files.map(async (file) => ({
          name: file.filename,
          url: await file.saveToDisk(`${category}/${await file.md5()}`),
          mime_type: file.mimetype,
          size: file.size,
        })),
      ),
    };
  }
}

export const FileModel = new FileModelClass();
