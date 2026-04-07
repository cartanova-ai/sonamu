import { type CacheControlConfig } from "../cache-control/types";
import { type CompressConfig } from "../compress/types";

// Branded type - 실수로 일반 객체 사용 방지
export type SSRQuery = {
  modelName: string; // 'UserModel' - 서버 모델 호출용
  methodName: string; // 'findById' - 서버 메서드 호출용
  params: unknown[]; // [subset, id] - Context 제외한 실제 파라미터
  serviceKey: [string, string]; // ['User', 'getUsers'] - React Query queryKey용
} & { __brand: "SSRQuery" };

export type PreloadConfig = SSRQuery[];

export type SSRRoute = {
  path: string;
  preload?: (params: Record<string, string>) => PreloadConfig;
  disableHydrate?: boolean;
  /** SSR 응답의 Cache-Control 헤더 설정. 설정하지 않으면 cacheControlHandler 또는 기본값이 적용됩니다. */
  cacheControl?: CacheControlConfig;
  /** SSR 응답의 압축 설정. false로 설정하면 압축을 비활성화합니다. */
  compress?: CompressConfig;
};

export type PreloadedData = {
  queryKey: unknown[];
  data: unknown;
};
