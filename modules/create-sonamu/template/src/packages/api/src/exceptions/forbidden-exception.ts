import { SoException } from "sonamu";
import { type LocalizedString } from "sonamu/dict";

/**
 * 로그인 여부와 관계없이 요청한 동작이 허용되지 않을 때 쓰는 403 예외입니다.
 * sonamu 코어에는 403 예외가 없어 프로젝트에서 정의합니다.
 */
export class ForbiddenException<Payload = undefined> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(403, message, payload);
  }
}
