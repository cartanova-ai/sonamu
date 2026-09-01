/**
 * 페이지 단위 HMR 비활성화(`?hmr=false`).
 *
 * 에이전트가 코드를 고치는 동안 사람이 보고 있는 탭이 계속 새로고침되는 것을 막기 위해,
 * 해당 URL로 연 페이지에서만 Vite HMR을 끊는다.
 *
 * Vite는 페이지 단위 HMR 토글을 제공하지 않는다. `server.hmr: false`는 서버 전체에 적용되고,
 * HTML에서 `/@vite/client` 스크립트 태그만 제거하는 방식도 통하지 않는다.
 * 변환된 모듈마다 `import { createHotContext } from "/@vite/client"`가 들어가기 때문이다.
 *
 * 그래서 HMR 웹소켓 자체를 막는다. Vite HMR 소켓은 서브프로토콜로 구분되므로
 * (`vite-hmr`, 재연결 확인은 `vite-ping`), 앱이 같은 포트에서 쓰는 웹소켓
 * (Sonamu telemetry, ctx.ws 등)은 그대로 두고 HMR만 골라낼 수 있다.
 *
 * 연결 실패로 처리하지 않고 "영원히 연결 중"인 더미 소켓을 돌려주는 이유는,
 * Vite 클라이언트가 소켓이 닫히면 재연결을 폴링하다가 성공 시 `location.reload()`를
 * 호출하기 때문이다. close/error 이벤트를 아예 발생시키지 않아야 새로고침되지 않는다.
 */

const HMR_OPT_OUT_QUERY = "hmr";

/** 요청 URL에 `?hmr=false`가 있는지 확인한다. */
export function isHmrDisabledByQuery(url: string): boolean {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) {
    return false;
  }

  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const value = params.get(HMR_OPT_OUT_QUERY);
  return value === "false" || value === "0";
}

/**
 * HMR 웹소켓만 무력화하는 인라인 스크립트.
 * 모듈 스크립트(`type="module"`)는 지연 실행되므로, 이 classic 스크립트가 항상 먼저 실행된다.
 */
export const HMR_OPT_OUT_SCRIPT = `<script>
(() => {
  var NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;
  var HMR_PROTOCOLS = ["vite-hmr", "vite-ping"];

  function createIdleSocket(url) {
    // 열리지도 닫히지도 않는 더미. close/error를 발생시키면 Vite가 재연결 후 새로고침한다.
    return {
      url: String(url),
      readyState: 0,
      protocol: "",
      bufferedAmount: 0,
      extensions: "",
      binaryType: "blob",
      onopen: null, onclose: null, onerror: null, onmessage: null,
      addEventListener: function () {},
      removeEventListener: function () {},
      dispatchEvent: function () { return false; },
      send: function () {},
      close: function () {},
      CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
    };
  }

  window.WebSocket = new Proxy(NativeWebSocket, {
    construct: function (Target, args) {
      var requested = args[1];
      var protocols = Array.isArray(requested) ? requested : requested ? [requested] : [];
      var isHmr = protocols.some(function (protocol) {
        return HMR_PROTOCOLS.indexOf(protocol) !== -1;
      });
      if (isHmr) {
        console.info("[sonamu] hmr=false: 이 페이지의 Vite HMR 연결을 막았습니다. 변경 사항은 반영되지 않습니다.");
        return createIdleSocket(args[0]);
      }
      return new Target(...args);
    },
  });
})();
</script>`;
