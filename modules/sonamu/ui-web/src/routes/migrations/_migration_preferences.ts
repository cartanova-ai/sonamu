import { useState } from "react";

const DETAILED_STORAGE_KEY = "sonamu:migrations:detailed";

function readDetailedMode() {
  try {
    return globalThis.localStorage?.getItem(DETAILED_STORAGE_KEY) === "true";
  } catch {
    // 저장소 접근이 차단된 환경에서도 마이그레이션 화면은 기본 모드로 열려야 합니다.
    return false;
  }
}

function writeDetailedMode(next: boolean) {
  try {
    globalThis.localStorage?.setItem(DETAILED_STORAGE_KEY, String(next));
  } catch {
    // 설정 저장 실패는 현재 세션의 상세 보기 전환을 막지 않습니다.
  }
}

export function useMigrationDetailedMode() {
  const [detailed, setDetailedState] = useState(readDetailedMode);
  const setDetailed = (next: boolean) => {
    writeDetailedMode(next);
    setDetailedState(next);
  };
  return [detailed, setDetailed] as const;
}
