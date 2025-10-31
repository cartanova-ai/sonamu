import fs from "fs/promises";
import path from "path";

/**
 * 파일 저장소의 공통 인터페이스
 */
export interface Driver {
  put(
    key: string,
    contents: Buffer,
    options?: { contentType?: string; visibility?: "public" | "private" }
  ): Promise<void>;

  getUrl(key: string): string;

  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

export type FSDriverConfig = {
  location: string;
  urlPrefix: string;
};

/**
 * 로컬 파일시스템
 */
export class FSDriver implements Driver {
  constructor(private config: FSDriverConfig) {}

  async put(key: string, contents: Buffer): Promise<void> {
    const filePath = path.join(this.config.location, key);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, contents);
  }

  getUrl(key: string): string {
    return `${this.config.urlPrefix}/${key}`;
  }

  // 로컬 파일시스템은 signed URL을 지원하지 않으므로 일반 URL 반환
  async getSignedUrl(key: string, _expiresIn?: number): Promise<string> {
    return this.getUrl(key);
  }
}
