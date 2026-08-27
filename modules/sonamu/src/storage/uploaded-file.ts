import { BaseFile } from "./base-file";
import { type DriverKey } from "./drivers";

/**
 * Stream 모드로 업로드된 파일
 * 이미 저장소에 스트리밍 완료된 상태로, url/key 등 메타데이터만 접근 가능합니다.
 */
export class UploadedFile extends BaseFile {
  private keyValue: string;
  private diskNameValue: DriverKey;

  constructor(params: {
    filename: string;
    mimetype: string;
    size: number;
    url: string;
    signedUrl: string;
    key: string;
    diskName: DriverKey;
  }) {
    super({
      filename: params.filename,
      mimetype: params.mimetype,
      size: params.size,
      url: params.url,
      signedUrl: params.signedUrl,
    });
    this.keyValue = params.key;
    this.diskNameValue = params.diskName;
  }

  /** 저장소 내 키 */
  get key(): string {
    return this.keyValue;
  }

  /** 저장된 디스크 이름 */
  get diskName(): DriverKey {
    return this.diskNameValue;
  }

  /**
   * 저장소에서 파일을 다운로드합니다.
   * 스트림 모드로 업로드된 파일을 나중에 처리해야 할 때 사용합니다.
   */
  async download(): Promise<Buffer> {
    const { Sonamu } = await import("../api/sonamu");
    const disk = Sonamu.storage.use(this.diskNameValue);

    const uint8Array = await disk.get(this.keyValue);
    return Buffer.from(uint8Array);
  }
}
