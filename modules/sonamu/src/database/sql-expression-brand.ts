/**
 * Puri 정식 API(Puri.rawString, Puri.count 등)로 만든 SqlExpression에만 붙는 브랜드입니다.
 *
 * JSON에는 Symbol 키를 담을 수 없으므로, 클라이언트가 보낸 `{ _type: "sql_expression", _sql }` 모양의
 * 평범한 객체는 이 브랜드를 가질 수 없고 raw SQL로 승격되지 않습니다.
 * 패키지가 중복 설치돼 모듈 인스턴스가 여러 개여도 같은 브랜드로 판정하도록 `Symbol.for`를 사용합니다.
 * 패키지 진입점(index.ts)에서는 내보내지 않습니다.
 */
export const SQL_EXPRESSION_BRAND: unique symbol = Symbol.for("sonamu.puri.sql_expression");
