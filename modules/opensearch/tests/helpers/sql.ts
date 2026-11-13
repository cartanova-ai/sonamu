const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
// Identifiers reach SQL text only as validated tokens, and the sql tag rejects anything else. CREATE ROLE ... PASSWORD
// takes no bind parameter, so the literal is restricted to hex digits.
const PASSWORD_PATTERN = /^[0-9a-f]{16,64}$/;

export class SqlToken {
  readonly #text: string;

  private constructor(text: string) {
    this.#text = text;
  }

  static fromVerified(text: string): SqlToken {
    return new SqlToken(text);
  }

  toSql(): string {
    return this.#text;
  }
}

export function quoteIdentifier(name: string): string {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new Error(
      `SQL 식별자가 허용 형식(^[a-z_][a-z0-9_]{0,62}$)이 아닙니다: ${JSON.stringify(name)}`,
    );
  }
  return `"${name}"`;
}

export function identifier(name: string): SqlToken {
  return SqlToken.fromVerified(quoteIdentifier(name));
}

export function qualified(schema: string, name: string): SqlToken {
  return SqlToken.fromVerified(`${quoteIdentifier(schema)}.${quoteIdentifier(name)}`);
}

export function passwordLiteral(password: string): SqlToken {
  if (!PASSWORD_PATTERN.test(password)) {
    throw new Error("테스트 역할 비밀번호는 16~64자리 16진수여야 합니다.");
  }
  return SqlToken.fromVerified(`'${password}'`);
}

export function tokenList(tokens: readonly SqlToken[]): SqlToken {
  if (tokens.length === 0) {
    throw new Error("빈 SQL 토큰 목록입니다.");
  }
  return SqlToken.fromVerified(tokens.map((token) => token.toSql()).join(", "));
}

export function sql(strings: TemplateStringsArray, ...tokens: readonly SqlToken[]): string {
  let text = strings[0];
  tokens.forEach((token, position) => {
    if (!(token instanceof SqlToken)) {
      throw new Error("sql 태그에는 identifier()/qualified()로 만든 토큰만 넣을 수 있습니다.");
    }
    text += token.toSql() + strings[position + 1];
  });
  return text;
}
