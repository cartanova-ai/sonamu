import type { MultipartFile } from "@fastify/multipart";
import { createHash } from "crypto";
import mime from "mime-types";
import type { DriverKey } from "./drivers";

/**
 * 업로드된 파일 래퍼
 */
export class UploadedFile {
  private _file: MultipartFile;
  private _buffer?: Buffer;
  private _url?: string;

  constructor(file: MultipartFile) {
    this._file = file;
  }

  /** 원본 파일명 */
  get filename(): string {
    return this._file.filename;
  }

  /** MIME 타입 */
  get mimetype(): string {
    return this._file.mimetype;
  }

  /** 파일 크기 (bytes) */
  get size(): number {
    return this._file.file.bytesRead;
  }

  /** 확장자 (점 제외) */
  get extname(): string | false {
    return mime.extension(this._file.mimetype);
  }

  /** saveToDisk 후 저장된 URL */
  get url(): string | undefined {
    return this._url;
  }

  /** Buffer로 변환 (캐싱됨) */
  async toBuffer(): Promise<Buffer> {
    if (!this._buffer) {
      this._buffer = await this._file.toBuffer();
    }
    return this._buffer;
  }

  /** MD5 해시 계산 */
  async md5(): Promise<string> {
    const buffer = await this.toBuffer();
    return createHash("md5").update(buffer).digest("hex");
  }

  /**
   * 파일을 디스크에 저장
   * @param key 저장 경로 (예: 'uploads/avatar.png')
   * @param diskName 디스크 이름 (기본: default disk)
   * @returns 저장된 파일의 URL
   */
  async saveToDisk(key: string, diskName?: DriverKey): Promise<string> {
    // 순환 의존성 방지를 위해 동적 import
    const { Sonamu } = await import("../api/sonamu");
    const disk = Sonamu.storage.use(diskName);
    const buffer = await this.toBuffer();

    await disk.put(key, new Uint8Array(buffer), {
      contentType: this.mimetype,
    });

    this._url = await disk.getSignedUrl(key);
    return this._url;
  }

  /** 원본 MultipartFile 접근 */
  get raw(): MultipartFile {
    return this._file;
  }
}
