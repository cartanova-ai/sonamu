import { bootstrap, test } from "sonamu/test";
import { describe, vi } from "vitest";

bootstrap(vi, { forTesting: false });

describe("Migrator - Integration 통합 워크플로우", () => {
  test.todo("Entity 변경 → 코드 생성 → Shadow 테스트 → 적용 → 최신 상태");
  test.todo("생성 → 삭제 - preparedCodes 생성 → 파일 생성 → 파일 삭제 → pending 없어짐");
  test.todo("적용 → 롤백 - pending 적용 → status === 0 → 롤백 → pending 다시 생김");
  test.todo("실패 복구 - Shadow 테스트 실패 → 파일 수정 → 재시도 성공 → 적용");
  test.todo("다중 환경 동기화 - development 최신, 다른 DB 뒤쳐짐 → 일괄 적용 → 모든 DB 동기화");
  test.todo("Pending 누적 - pending 있는 상태에서 Entity 변경 → 새 코드 추가 → pending 누적");
});
