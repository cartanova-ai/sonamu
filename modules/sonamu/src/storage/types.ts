import type { DriverContract } from "flydrive/types";
import type { DriverKey } from "./drivers";

/**
 * Storage 설정 타입
 */
export type StorageConfig = {
  /** 기본 디스크 이름 */
  default: string;
  /** 디스크별 드라이버 팩토리 */
  drivers: Record<DriverKey, () => DriverContract>;
};
