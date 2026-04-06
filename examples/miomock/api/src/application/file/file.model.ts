import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  NotFoundException,
  Sonamu,
  upload,
} from "sonamu";
import type { ListResult, SonamuFile } from "sonamu";

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
    const { bufferedFiles } = Sonamu.getContext();

    console.log("bufferedFiles", bufferedFiles);
    if (!bufferedFiles || bufferedFiles.length === 0) {
      throw new BadRequestException(SD("file.uploadFailed"));
    }

    const files = await Promise.all(
      bufferedFiles.map(async (file) => {
        const md5 = await file.md5();
        const key = `${md5}.${file.extname}`;
        return {
          name: file.filename,
          url: await file.saveToDisk("fs", key),
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
    const { bufferedFiles } = Sonamu.getContext();
    const { category } = params;

    if (!bufferedFiles || bufferedFiles.length === 0) {
      throw new BadRequestException(SD("file.uploadFailed"));
    }

    console.log("bufferedFiles를 원하는 로직으로 처리해주세요", bufferedFiles);

    return {
      category,
      files: await Promise.all(
        bufferedFiles.map(async (file) => ({
          name: file.filename,
          url: await file.saveToDisk("fs", `${category}/${await file.md5()}`),
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
    const { bufferedFiles } = Sonamu.getContext();
    if (!bufferedFiles || bufferedFiles.length === 0) {
      throw new BadRequestException(SD("file.uploadFailed"));
    }

    return {
      category,
      files: await Promise.all(
        bufferedFiles.map(async (file) => ({
          name: file.filename,
          url: await file.saveToDisk("fs", `${category}/${await file.md5()}`),
          mime_type: file.mimetype,
          size: file.size,
        })),
      ),
    };
  }

  /**
   * Buffer 모드 테스트용 API
   * - 파일을 메모리에 로드한 후 MD5 해시로 저장합니다.
   * - name 파라미터를 함께 받아서 응답에 포함합니다.
   */
  @upload({ limits: { files: 5 } })
  async testBufferUpload(params: { name: string }): Promise<{
    name: string;
    files: { filename: string; url: string; mimetype: string; size: number; md5: string }[];
  }> {
    const { bufferedFiles } = Sonamu.getContext();
    const { name } = params;

    if (!bufferedFiles || bufferedFiles.length === 0) {
      throw new BadRequestException(SD("file.uploadFailed"));
    }

    console.log("bufferedFiles", bufferedFiles);

    const files = await Promise.all(
      bufferedFiles.map(async (file) => {
        const md5 = await file.md5();
        const key = `buffer-test/${md5}.${file.extname}`;
        return {
          filename: file.filename,
          url: await file.saveToDisk("fs", key),
          mimetype: file.mimetype,
          size: file.size,
          md5,
        };
      }),
    );

    return { name, files };
  }

  /**
   * Stream 모드 테스트용 API
   * - 파일을 즉시 저장소로 스트리밍합니다.
   * - name 파라미터를 함께 받아서 응답에 포함합니다.
   */
  @upload({
    consume: "stream",
    destination: "fs",
    keyGenerator: (file) => `${Date.now()}-${file.filename}`,
    limits: { files: 5 },
  })
  async testStreamUpload(params: { name: string }): Promise<{
    name: string;
    files: { filename: string; url: string; mimetype: string; size: number; key: string }[];
  }> {
    const { uploadedFiles } = Sonamu.getContext();
    const { name } = params;

    if (!uploadedFiles || uploadedFiles.length === 0) {
      throw new BadRequestException(SD("file.uploadFailed"));
    }

    console.log("uploadedFiles", uploadedFiles);

    return {
      name,
      files: uploadedFiles.map((file) => ({
        filename: file.filename,
        url: file.signedUrl,
        mimetype: file.mimetype,
        size: file.size,
        key: file.key,
      })),
    };
  }
}

export const FileModel = new FileModelClass();
