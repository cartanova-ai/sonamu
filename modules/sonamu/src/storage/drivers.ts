import { FSDriver } from "flydrive/drivers/fs";
import { type FSDriverOptions } from "flydrive/drivers/fs/types";
import { type S3DriverOptions } from "flydrive/drivers/s3/types";

import { SonamuS3Driver } from "./s3-driver";

/**
 * 드라이버 팩토리 함수
 * 설정 → 드라이버 인스턴스 생성 함수 변환
 */
export const drivers = {
  fs: (config: FSDriverOptions) => () => new FSDriver(config),
  s3: (config: S3DriverOptions) => () => new SonamuS3Driver(config),
};

export type DriverKey = keyof typeof drivers;
