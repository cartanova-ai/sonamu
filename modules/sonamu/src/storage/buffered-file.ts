import { createHash } from "crypto";

import { type MultipartFile } from "@fastify/multipart";

import { BaseFile } from "./base-file";
import { type DiskName } from "./types";
import { resolveUploadContentType } from "./upload-safety";

/**
 * Buffer 모드로 업로드된 파일
 * 메모리에 로드된 상태로, md5 계산이나 이미지 처리 등 유연한 작업이 가능합니다.
 */
export class BufferedFile extends BaseFile {
  private fileValue: MultipartFile;
  private bufferValue: Buffer;

  constructor(file: MultipartFile, buffer: Buffer) {
    super({
      filename: file.filename,
      mimetype: file.mimetype,
      size: buffer.length,
    });
    this.fileValue = file;
    this.bufferValue = buffer;
  }

  /** 파일 Buffer */
  get buffer(): Buffer {
    return this.bufferValue;
  }

  /** MD5 해시 계산 */
  async md5(): Promise<string> {
    return createHash("md5").update(this.bufferValue).digest("hex");
  }

  /**
   * 파일을 디스크에 저장
   * Content-Type 은 resolveUploadContentType 으로 정해, 허용 목록 밖의 MIME 은 `application/octet-stream` 으로 저장합니다.
   * @param diskName 설정에 등록한 디스크 이름
   * @param key 저장 경로 (예: 'uploads/avatar.png')
   * @returns 저장된 파일의 URL
   */
  async saveToDisk(diskName: DiskName, key: string): Promise<string> {
    // 순환 의존성 방지를 위해 동적 import
    const { Sonamu } = await import("../api/sonamu");
    const disk = Sonamu.storage.use(diskName);

    await disk.put(key, new Uint8Array(this.bufferValue), {
      contentType: resolveUploadContentType(this.mimetype),
    });

    this["_url"] = await disk.getUrl(key);
    this["_signedUrl"] = await disk.getSignedUrl(key);

    // signed url은 만료 시간이 있기 때문에, unsigned url을 반환합니다.
    return this["_url"];
  }

  /** 원본 MultipartFile 접근 */
  get raw(): MultipartFile {
    return this.fileValue;
  }
}
