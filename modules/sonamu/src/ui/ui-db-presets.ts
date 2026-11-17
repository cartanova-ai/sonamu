import { type SonamuDBConfig, type SonamuDBPreset } from "../database/db";
import { SD } from "../dict/sd";
import { BadRequestException } from "../exceptions/so-exceptions";

/**
 * Sonamu UI(dev 서버) HTTP API가 다룰 수 있는 DB 프리셋입니다.
 *
 * dev 서버는 브라우저에서 호출되므로 staging·production 같은 운영 계열 프리셋은
 * 마이그레이션·fixture 조회·저장 대상에서 제외하고, CLI로만 다루게 합니다.
 */
export const UI_DB_PRESETS = [
  "development",
  "development_readonly",
  "test",
  "test_readonly",
  "fixture",
] as const satisfies readonly SonamuDBPreset[];

/**
 * 주어진 값이 UI API에서 허용되는 DB 프리셋인지 확인합니다.
 * 요청 본문이 배열 등 다른 형태여도 허용 목록과 일치하지 않으므로 거부됩니다.
 */
export function isUIDBPreset(preset: string): preset is (typeof UI_DB_PRESETS)[number] {
  return UI_DB_PRESETS.some((allowed) => allowed === preset);
}

/**
 * UI API 요청의 DB 프리셋 값을 검증합니다.
 * 허용 목록 밖이거나 현재 설정에 없는 프리셋이면 DB에 연결하기 전에 거부합니다.
 */
export function assertUIDBPreset(
  preset: string,
  dbConfig: SonamuDBConfig,
  field: string,
): asserts preset is keyof SonamuDBConfig {
  if (!isUIDBPreset(preset) || !Object.hasOwn(dbConfig, preset)) {
    throw new BadRequestException(SD("error.badRequest"), {
      message: `DB preset is not allowed in Sonamu UI (${field}): ${String(preset)}`,
    });
  }
}
