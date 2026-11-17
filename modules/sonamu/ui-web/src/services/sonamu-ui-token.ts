/** 서버가 부팅 때 발급해 index.html에 넣어 주는 Sonamu UI 접근 토큰을 담는 헤더입니다. */
export const SONAMU_UI_TOKEN_HEADER = "X-Sonamu-UI-Token";

/**
 * index.html의 meta 태그에서 접근 토큰을 읽어 요청 헤더로 만듭니다.
 *
 * 서버는 이 헤더가 없는 Sonamu UI API 요청을 401로 거부합니다.
 * 커스텀 헤더라서 다른 출처 웹페이지의 form·no-cors 요청에는 실을 수 없습니다.
 */
export function sonamuUITokenHeaders() {
  const token =
    document.querySelector<HTMLMetaElement>('meta[name="sonamu-ui-token"]')?.content ?? "";
  return { [SONAMU_UI_TOKEN_HEADER]: token };
}
