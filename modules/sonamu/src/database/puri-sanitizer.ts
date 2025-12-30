/**
 * Puri 쿼리 빌더를 위한 SQL 인젝션 방지 유틸리티
 *
 * 이 모듈은 SQL 쿼리에 사용되는 값들을 검증하고 이스케이프합니다.
 * Puri.rawString, Puri.rawNumber 등에서 직접 문자열 인터폴레이션을 사용하기 때문에,
 * 사용자 입력이 SQL에 포함되기 전에 반드시 이 함수들을 거쳐야 합니다.
 */

/**
 * SQL 문자열 리터럴을 이스케이프합니다.
 * 작은따옴표를 두 개로 치환하여 SQL 인젝션을 방지합니다.
 *
 * @example
 * escapeSqlLiteral("O'Reilly") // "O''Reilly"
 */
export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * SQL identifier(컬럼명, 테이블명 등)를 검증합니다.
 * 허용: 영문자, 숫자, 언더스코어, 점(스키마.테이블.컬럼), 큰따옴표(quoted identifier), 별표(*)
 *
 * @throws {Error} 유효하지 않은 identifier인 경우
 * @example
 * validateIdentifier("users.name") // OK
 * validateIdentifier("*") // OK (COUNT(*) 등)
 * validateIdentifier("name; DROP TABLE") // Error
 */
export function validateIdentifier(name: string): string {
  // * 는 COUNT(*) 등에서 사용되므로 허용
  if (name === "*") return name;
  // 허용 패턴: 영문자/숫자/언더스코어/점/큰따옴표로만 구성, 첫 글자는 영문자/언더스코어/큰따옴표
  if (!/^[a-zA-Z_"][a-zA-Z0-9_."]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

/**
 * SQL 표현식(함수 호출 포함)을 검증합니다.
 * tsRank, tsHighlight 등에서 to_tsvector('config', column) 형태의 표현식을 허용합니다.
 * 위험한 문자(세미콜론, 주석 등)를 차단합니다.
 *
 * @throws {Error} 위험한 패턴이 포함된 경우
 * @example
 * validateSqlExpression("to_tsvector('simple', title)") // OK
 * validateSqlExpression("col; DROP TABLE users") // Error
 */
export function validateSqlExpression(expr: string): string {
  // 위험한 패턴 차단: 세미콜론(statement 구분), 주석(--, /*)
  if (/;|--\/\*|\*\//.test(expr)) {
    throw new Error(`Potentially unsafe SQL expression: ${expr}`);
  }
  // 빈 문자열 차단
  if (!expr.trim()) {
    throw new Error("SQL expression cannot be empty");
  }
  return expr;
}

/**
 * PostgreSQL text search parser 함수를 검증합니다.
 * 화이트리스트 방식으로 허용된 parser만 통과시킵니다.
 *
 * @throws {Error} 허용되지 않은 parser인 경우
 * @example
 * validateTsParser("websearch_to_tsquery") // OK
 * validateTsParser("evil_function") // Error
 */
export function validateTsParser(parser: string): string {
  const allowed = [
    "to_tsquery",
    "plainto_tsquery",
    "phraseto_tsquery",
    "websearch_to_tsquery",
  ];
  if (!allowed.includes(parser)) {
    throw new Error(
      `Invalid text search parser: ${parser}. Allowed: ${allowed.join(", ")}`
    );
  }
  return parser;
}

/**
 * PostgreSQL text search configuration을 검증합니다.
 * 허용: 영문자, 숫자, 언더스코어로만 구성 (simple, english, korean 등)
 *
 * @throws {Error} 유효하지 않은 config인 경우
 * @example
 * validateTsConfig("simple") // OK
 * validateTsConfig("korean") // OK
 * validateTsConfig("'; DROP TABLE") // Error
 */
export function validateTsConfig(config: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config)) {
    throw new Error(`Invalid text search config: ${config}`);
  }
  return config;
}

/**
 * 숫자 값을 검증합니다.
 * Infinity, NaN 등 유효하지 않은 숫자를 차단합니다.
 *
 * @throws {Error} 유효하지 않은 숫자인 경우
 * @example
 * validateNumber(42) // OK
 * validateNumber(Infinity) // Error
 * validateNumber(NaN) // Error
 */
export function validateNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return value;
}
