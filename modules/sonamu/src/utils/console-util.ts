/**
 * 텍스트를 터미널 중앙에 정렬합니다.
 *
 * @note TTY 모드가 아닐 경우 (파이프, 리다이렉트, CI/CD 환경 등) 기본 폭 80을 사용합니다.
 */
export function centerText(text: string): string {
  const columns = process.stdout.columns ?? 80;
  const margin = Math.max(0, Math.floor((columns - text.length) / 2));
  return " ".repeat(margin) + text + " ".repeat(margin);
}
