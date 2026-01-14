/** biome-ignore-all lint/suspicious/noExplicitAny: 제네릭 기본값으로 any 사용 */

export type SonamuFile = {
  name: string;
  url: string;
  mime_type: string;
  size: number;
};

export type SonamuAuth<TUser = any, TLoginParams = any> = {
  user: TUser | null;
  loading: boolean;
  login: (params: TLoginParams) => void;
  logout: () => void;
  refetch: () => void;
};
