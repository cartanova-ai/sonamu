import type z from "zod";

import { type LocalizedString } from "../dict/types";
import { type JsonValue } from "../types/types";

type ExceptionPayload = JsonValue | z.core.$ZodIssue[];
import { isObjectValue } from "../utils/runtime-value";

export abstract class SoException<Payload = ExceptionPayload> extends Error {
  constructor(
    public readonly statusCode: number,
    public message: LocalizedString,
    public payload?: Payload,
  ) {
    super(String(message));
  }
}

export function isSoException<Value>(err: Value): err is Value & SoException {
  return isObjectValue(err) && "statusCode" in err;
}

/*
	잘못된 매개변수 등 요청사항에 문제가 있는 경우
*/
export class BadRequestException<Payload = ExceptionPayload> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(400, message, payload);
  }
}

/*
	로그인이 반드시 필요한 케이스에 로그아웃 상태인 경우 / 접근 권한이 없는 요청시
*/
export class UnauthorizedException<Payload = ExceptionPayload> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(401, message, payload);
  }
}

/*
	존재하지 않는 레코드에 접근시
*/
export class NotFoundException<Payload = ExceptionPayload> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(404, message, payload);
  }
}

/*
	현재 상태에서 처리가 불가능한 케이스
*/
export class ServiceUnavailableException<Payload = ExceptionPayload> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(503, message, payload);
  }
}

/*
	내부 처리 로직 (외부 API 콜 포함) 오류 발생시
*/
export class InternalServerErrorException<Payload = ExceptionPayload> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(500, message, payload);
  }
}

/*
	이미 처리함
*/
export class AlreadyProcessedException<Payload = ExceptionPayload> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(541, message, payload);
  }
}

/*
	중복 허용하지 않는 케이스에 중복 요청
*/
export class DuplicateRowException<Payload = ExceptionPayload> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(542, message, payload);
  }
}

/*
	뭔가를 하려고 했으나 대상이 없음
*/
export class TargetNotFoundException<Payload = ExceptionPayload> extends SoException<Payload> {
  constructor(message: LocalizedString, payload?: Payload) {
    super(520, message, payload);
  }
}
