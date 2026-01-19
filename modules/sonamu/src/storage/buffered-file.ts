import type { MultipartFile } from "@fastify/multipart";
import { createHash } from "crypto";
import { BaseFile } from "./base-file";
import type { DriverKey } from "./drivers";

/**
 * Buffer 모드로 업로드된 파일
 * 메모리에 로드된 상태로, md5 계산이나 이미지 처리 등 유연한 작업이 가능합니다.
 */
export class BufferedFile extends BaseFile {
  private _file: MultipartFile;
  private _buffer: Buffer;

  constructor(file: MultipartFile, buffer: Buffer) {
    super({
      filename: file.filename,
      mimetype: file.mimetype,
      size: buffer.length,
    });
    this._file = file;
    this._buffer = buffer;
  }

  /** 파일 Buffer */
  get buffer(): Buffer {
    return this._buffer;
  }

  /** MD5 해시 계산 */
  async md5(): Promise<string> {
    return createHash("md5").update(this._buffer).digest("hex");
  }

  /**
   * 파일을 디스크에 저장
   * @param key 저장 경로 (예: 'uploads/avatar.png')
   * @param diskName 디스크 이름 (기본: default disk)
   * @returns 저장된 파일의 URL
   */
  async saveToDisk(diskName: DriverKey, key: string): Promise<string> {
    // 순환 의존성 방지를 위해 동적 import
    const { Sonamu } = await import("../api/sonamu");
    const disk = Sonamu.storage.use(diskName);

    await disk.put(key, new Uint8Array(this._buffer), {
      contentType: this.mimetype,
    });

    this._url = await disk.getUrl(key);
    this._signedUrl = await disk.getSignedUrl(key);

    // signed url은 만료 시간이 있기 때문에, unsigned url을 반환합니다.
    return this._url;
  }

  /** 원본 MultipartFile 접근 */
  get raw(): MultipartFile {
    return this._file;
  }
}
