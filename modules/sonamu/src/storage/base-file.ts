import mime from "mime-types";

/**
 * 파일의 기본 메타데이터(filename, mimetype, size 등)에 대한 접근자 제공
 */
export abstract class BaseFile {
  protected _filename: string;
  protected _mimetype: string;
  protected _size: number;
  protected _url?: string;
  protected _signedUrl?: string;

  constructor(params: {
    filename: string;
    mimetype: string;
    size: number;
    url?: string;
    signedUrl?: string;
  }) {
    this["_filename"] = params.filename;
    this["_mimetype"] = params.mimetype;
    this["_size"] = params.size;
    this["_url"] = params.url;
    this["_signedUrl"] = params.signedUrl;
  }

  /** 원본 파일명 */
  get filename(): string {
    return this["_filename"];
  }

  /** MIME 타입 */
  get mimetype(): string {
    return this["_mimetype"];
  }

  /** 파일 크기 (bytes) */
  get size(): number {
    return this["_size"];
  }

  /** 확장자 (점 제외) */
  get extname(): string | false {
    return mime.extension(this["_mimetype"]);
  }

  /** 저장된 URL (Unsigned) */
  get url(): string {
    if (this["_url"] === undefined) {
      throw new Error("url이 설정되지 않았습니다.");
    }
    return this["_url"];
  }

  /** 저장된 URL (Signed) */
  get signedUrl(): string {
    if (this["_signedUrl"] === undefined) {
      throw new Error("signedUrl이 설정되지 않았습니다.");
    }
    return this["_signedUrl"];
  }
}
