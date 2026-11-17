import chalk from "chalk";

import { SD } from "../dict/sd";
import { UnauthorizedException } from "../exceptions/so-exceptions";
import { type ExtendedApi, type GuardKey } from "./decorators";

// 서버 상태를 바꾸지 않는 HTTP 메서드. 이 외의 메서드는 상태 변경 API로 본다.
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * guards를 지정하지 않은 상태 변경(POST/PUT/PATCH/DELETE 등) API 목록을 반환합니다.
 *
 * - `guards`가 `undefined`인 API만 대상입니다. `guards: []`는 공개 API를 명시적으로 표시한 것으로 보고 제외합니다.
 * - WebSocket API는 GET 업그레이드로 연결되므로 제외합니다.
 */
export function findUnguardedMutationApis(apis: readonly ExtendedApi[]): ExtendedApi[] {
  return apis.filter((api) => {
    if (api.websocketOptions) {
      return false;
    }
    const method = (api.options.httpMethod ?? "GET").toUpperCase();
    if (SAFE_HTTP_METHODS.has(method)) {
      return false;
    }
    return api.options.guards === undefined;
  });
}

/**
 * guards 없는 상태 변경 API가 있으면 부팅 시 경고를 출력합니다.
 * guards 미지정은 인증 없이 누구나 호출할 수 있다는 뜻이므로, 의도한 공개 API라면 `guards: []`로 명시하게 안내합니다.
 *
 * @returns 경고 대상 API 목록
 */
export function warnUnguardedMutationApis(
  apis: readonly ExtendedApi[],
  log: (message: string) => void = console.warn,
): ExtendedApi[] {
  const unguarded = findUnguardedMutationApis(apis);
  if (unguarded.length === 0) {
    return unguarded;
  }

  const lines = unguarded.map(
    (api) =>
      `    ${(api.options.httpMethod ?? "GET").toUpperCase()} ${api.path} (${api.modelName}.${api.methodName})`,
  );
  log(
    chalk.yellow(
      [
        `⚠ ${unguarded.length} state-changing API(s) have no guards and are callable without authentication:`,
        ...lines,
        `  Add guards (e.g. guards: ["user"]) or mark intentionally public APIs with guards: [].`,
      ].join("\n"),
    ),
  );
  return unguarded;
}

/**
 * `guardKeys`에 없는 가드 키를 사용하는 API와 그 키 목록을 반환합니다.
 */
export function findApisWithUnhandledGuardKeys(
  apis: readonly ExtendedApi[],
  guardKeys: readonly GuardKey[],
): { api: ExtendedApi; keys: GuardKey[] }[] {
  const handled = new Set<GuardKey>(guardKeys);
  return apis.flatMap((api) => {
    const keys = (api.options.guards ?? []).filter((guard) => !handled.has(guard));
    return keys.length > 0 ? [{ api, keys }] : [];
  });
}

/**
 * 부팅 시 `guardKeys` 설정을 검사합니다.
 *
 * - `guardKeys`를 설정했으면, 목록에 없는 가드 키를 쓰는 API가 있을 때 부팅을 중단합니다.
 *   그대로 두면 해당 API는 런타임에 항상 거부되므로 설정 실수를 부팅 시점에 드러냅니다.
 * - `guardKeys`를 설정하지 않았으면 기존 동작(모든 키를 guardHandler에 위임)을 유지하고,
 *   가드를 쓰는 API가 있을 때만 처리되지 않은 키가 통과될 수 있다고 경고합니다.
 */
export function checkGuardKeys(
  apis: readonly ExtendedApi[],
  guardKeys: readonly GuardKey[] | undefined,
  log: (message: string) => void = console.warn,
): void {
  if (guardKeys === undefined) {
    const usesGuards = apis.some((api) => (api.options.guards ?? []).length > 0);
    if (usesGuards) {
      log(
        chalk.yellow(
          [
            "⚠ server.apiConfig.guardKeys is not configured: every guard key is passed to guardHandler,",
            "  and a key the guardHandler does not check is allowed.",
            '  Declare the keys your guardHandler implements (e.g. guardKeys: ["user", "admin"]) to deny any other key.',
          ].join("\n"),
        ),
      );
    }
    return;
  }

  const unhandled = findApisWithUnhandledGuardKeys(apis, guardKeys);
  if (unhandled.length === 0) {
    return;
  }
  const lines = unhandled.map(
    ({ api, keys }) => `    ${api.path} (${api.modelName}.${api.methodName}): ${keys.join(", ")}`,
  );
  throw new Error(
    [
      `${unhandled.length} API(s) use guard keys that are not in server.apiConfig.guardKeys [${guardKeys.join(", ")}]:`,
      ...lines,
      "  Implement these keys in guardHandler and add them to guardKeys, or remove them from the APIs.",
    ].join("\n"),
  );
}

/**
 * `guardKeys`가 설정된 경우, 목록에 없는 가드 키 요청을 guardHandler 호출 없이 거부합니다.
 * `guardKeys`가 없으면 기존 동작을 유지하기 위해 아무것도 하지 않습니다.
 */
export function assertGuardKeyHandled(
  guard: GuardKey,
  guardKeys: readonly GuardKey[] | undefined,
): void {
  if (guardKeys !== undefined && !guardKeys.includes(guard)) {
    throw new UnauthorizedException(SD("error.forbidden"));
  }
}
