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
};

export type PreloadedData = {
  queryKey: unknown[];
  data: unknown;
};
