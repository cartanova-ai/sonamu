import { useSonamuContext } from "@sonamu-kit/react-components";

/**
 * useSonamuContext의 auth wrapper 함수
 * 프로젝트별 타입 안정성을 위한 wrapper
 */
export function useAuth() {
  return useSonamuContext().auth;
}
