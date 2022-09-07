import path, { dirname } from "path";
import { BadRequestException } from "@sonamu/core";
import { Context } from "@sonamu/core";
import { api } from "@sonamu/core";
import { existsSync, mkdirSync } from "fs";

export class FileModelClass {
  @api({ httpMethod: "POST", clients: ["axios-multipart"] })
  async upload({
    uploadedFile: uf,
  }: Context): Promise<{ file: { path: string; url: string } }> {
    if (uf === undefined) {
      throw new BadRequestException("파일 업로드되지 않음");
    }
    const ext = this.resolveExt(uf.mimetype);
    const publicPath = path.join(__dirname, `../../../public`);
    const dstPath = path.join(publicPath, `/uploaded/${uf.md5}.${ext}`);
    if (existsSync(dirname(dstPath)) === false) {
      mkdirSync(dirname(dstPath), {
        recursive: true,
      });
    }
    await uf.mv(dstPath);

    const url = dstPath.replace(publicPath, "/api/public");
    return {
      file: {
        path: dstPath,
        url,
      },
    };
  }

  resolveExt(mimetype: string): string {
    if (mimetype.includes("/")) {
      const [, tail] = mimetype.split("/");
      return tail;
    }
    return mimetype;
  }
}
export const FileModel = new FileModelClass();
