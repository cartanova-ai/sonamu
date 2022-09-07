export abstract class SoException extends Error {
  constructor(
    public readonly statusCode: number,
    public message: string,
    public payload?: unknown
  ) {
    super(message);
  }
}

export function isSoException(err: any): err is SoException {
  return err.statusCode !== undefined;
}

/*
	잘못된 매개변수 등 요청사항에 문제가 있는 경우
*/
export class BadRequestException extends SoException {
  constructor(public message = "Bad Request", public payload?: unknown) {
    super(400, message, payload);
  }
}

/*
	로그인이 반드시 필요한 케이스에 로그아웃 상태인 경우 / 접근 권한이 없는 요청시
*/
export class UnauthorizedException extends SoException {
  constructor(public message = "Unauthorized", public payload?: unknown) {
    super(401, message, payload);
  }
}

/*
	존재하지 않는 레코드에 접근시
*/
export class NotFoundException extends SoException {
  constructor(public message = "Not Found", public payload?: unknown) {
    super(404, message, payload);
  }
}

/*
	현재 상태에서 처리가 불가능한 케이스
*/
export class ServiceUnavailableException extends SoException {
  constructor(
    public message = "Service Unavailable",
    public payload?: unknown
  ) {
    super(503, message, payload);
  }
}

/*
	내부 처리 로직 (외부 API 콜 포함) 오류 발생시
*/
export class InternalServerErrorException extends SoException {
  constructor(
    public message = "Internal Server Error",
    public payload?: unknown
  ) {
    super(500, message, payload);
  }
}

/*
	이미 처리함
*/
export class AlreadyProcessedException extends SoException {
  constructor(public message = "Already Processed", public payload?: unknown) {
    super(641, message, payload);
  }
}

/*
	중복 허용하지 않는 케이스에 중복 요청
*/
export class DuplicateRowException extends SoException {
  constructor(public message = "Duplicate Row", public payload?: unknown) {
    super(642, message, payload);
  }
}

/*
	뭔가를 하려고 했으나 대상이 없음
*/
export class TargetNotFoundException extends SoException {
  constructor(public message = "Target Not Found", public payload?: unknown) {
    super(620, message, payload);
  }
}
