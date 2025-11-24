import { register } from "node:module";

/**
 * @sonamu-kit/loader/loader를 등록하는 스크립트입니다.
 * 이 스크립트는 sonamu cli로 dev 실행할 때 --import로 실행됩니다.
 */
register("@sonamu-kit/loader/loader", {
  parentURL: import.meta.url,
});
