import { SD } from "@/i18n/sd.generated";

export function translateFilterEnumKey(key: string): string {
  const [, enumName, ...valueParts] = key.split(".");
  if (!enumName || valueParts.length === 0) return key;

  // 필터가 조합한 enum 키를 생성된 enum 라벨 조회 API로 안전하게 분해합니다.
  return SD.enumLabels(enumName)[valueParts.join(".")] ?? key;
}
