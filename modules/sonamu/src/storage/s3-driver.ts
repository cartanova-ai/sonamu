import { type Readable } from "stream";

import { S3Client } from "@aws-sdk/client-s3";
import { type ObjectCannedACL } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { type Options } from "@aws-sdk/lib-storage";
import { S3Driver } from "flydrive/drivers/s3";
import { type S3DriverOptions } from "flydrive/drivers/s3/types";

/**
 * Sonamu용 S3 드라이버
 *
 * flydrive의 S3Driver를 확장하여 putStream에서
 * @aws-sdk/lib-storage의 Upload 클래스를 사용합니다.
 * 이를 통해 스트림 크기를 모르는 상태에서도 업로드가 가능합니다.
 *
 * 기존 S3Driver.putStream은 PutObjectCommand를 사용하여 Content-Length가 필요했지만,
 * Upload 클래스는 multipart upload를 통해 스트림 크기 없이도 업로드할 수 있습니다.
 */
export class SonamuS3Driver extends S3Driver {
  private sonamuClient: S3Client;
  private sonamuBucket: string;
  private sonamuVisibility: "public" | "private";
  private sonamuSupportsACL: boolean;

  constructor(options: S3DriverOptions) {
    super(options);

    // S3Client 인스턴스 저장 (Upload 클래스에서 사용)
    this.sonamuClient = "client" in options ? options.client : new S3Client(options);
    this.sonamuBucket = options.bucket;
    this.sonamuVisibility = options.visibility ?? "private";
    this.sonamuSupportsACL = options.supportsACL ?? false;
  }

  /**
   * 스트림을 S3에 업로드합니다.
   *
   * @aws-sdk/lib-storage의 Upload 클래스를 사용하여
   * multipart upload로 처리합니다.
   */
  override async putStream(
    key: string,
    contents: Readable,
    options?: {
      contentType?: string;
      visibility?: "public" | "private";
      cacheControl?: string;
      contentDisposition?: string;
    },
  ): Promise<void> {
    const visibility = options?.visibility ?? this.sonamuVisibility;

    const uploadParams: Options["params"] = {
      Bucket: this.sonamuBucket,
      Key: key,
      Body: contents,
      ContentType: options?.contentType,
      CacheControl: options?.cacheControl,
      ContentDisposition: options?.contentDisposition,
    };

    // ACL 지원 시에만 설정
    if (this.sonamuSupportsACL) {
      uploadParams.ACL =
        /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ (
          visibility === "public" ? "public-read" : "private"
        ) as ObjectCannedACL;
    }

    const upload = new Upload({
      client: this.sonamuClient,
      params: uploadParams,
    });

    await upload.done();
  }
}
