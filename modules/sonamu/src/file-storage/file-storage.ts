import type { MultipartFile } from "@fastify/multipart";
import mime from "mime-types";
import { createHash } from "crypto";
import type { Driver } from "./driver";

/**
 * @fastify/multipart의 MultipartFile 래퍼
 */
export class FileStorage {
  private _file: MultipartFile;
  private _buffer?: Buffer;
  private _driver: Driver;

  constructor(file: MultipartFile, driver: Driver) {
    this._file = file;
    this._driver = driver;
  }

  /**
   * 사용자 컴퓨터의 원본 파일명
   */
  get clientName(): string {
    return this._file.filename;
  }

  /**
   * 파일명 (clientName의 별칭)
   */
  get filename(): string {
    return this._file.filename;
  }

  /**
   * HTML input 필드명
   */
  get fieldName(): string {
    return this._file.fieldname;
  }

  /**
   * 파일 크기 (바이트)
   */
  get size(): number {
    return this._file.file.bytesRead;
  }

  /**
   * 파일 확장자 (점 제외)
   */
  get extname(): string | false {
    return mime.extension(this._file.mimetype);
  }

  get mimetype(): string {
    return this._file.mimetype;
  }

  get encoding(): string {
    return this._file.encoding;
  }

  async toBuffer(): Promise<Buffer> {
    if (!this._buffer) {
      this._buffer = await this._file.toBuffer();
    }
    return this._buffer;
  }

  async md5(): Promise<string> {
    const buffer = await this.toBuffer();
    return createHash("md5").update(buffer).digest("hex");
  }

  /**
   * 파일을 저장소에 저장
   *
   * @example
   * ```typescript
   * const { file } = Sonamu.getUploadContext();
   * const url = await file.saveToDisk('uploads/avatar.png');
   * ```
   */
  async saveToDisk(
    key: string,
    options?: { contentType?: string; visibility?: "public" | "private" }
  ): Promise<string> {
    const buffer = await this.toBuffer();

    await this._driver.put(key, buffer, {
      contentType: options?.contentType ?? this.mimetype,
      visibility: options?.visibility,
    });

    return this._driver.getSignedUrl(key);
  }

  get raw(): MultipartFile {
    return this._file;
  }
}
