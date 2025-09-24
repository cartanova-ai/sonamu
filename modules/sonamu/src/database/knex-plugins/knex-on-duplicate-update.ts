import knex from "knex";

export function attachOnDuplicateUpdate() {
  try {
    knex.QueryBuilder.extend("onDuplicateUpdate", function (...columns) {
      if (columns.length === 0) {
        // 업데이트 할 컬럼이 없으면 onDuplicateUpdate 구문 처리 패스
        const { sql: originalSQL, bindings: originalBindings } = this.toSQL();
        return this.client.raw(originalSQL, originalBindings);
      }

      const { placeholders, bindings } = columns.reduce(
        (result, column) => {
          if (typeof column === "string") {
            result.placeholders.push(`?? = Values(??)`);
            result.bindings.push(column, column);
          } else if (column && typeof column === "object") {
            Object.keys(column).forEach((key) => {
              result.placeholders.push(`?? = ?`);
              result.bindings.push(key, column[key]);
            });
          } else {
            throw new Error(
              "onDuplicateUpdate error: expected column name to be string or object."
            );
          }

          return result;
        },
        { placeholders: [], bindings: [] }
      );

      const { sql: originalSQL, bindings: originalBindings } = this.toSQL();

      const newBindings = [...originalBindings, ...bindings];

      return this.client.raw(
        `${originalSQL} ON DUPLICATE KEY UPDATE ${placeholders.join(", ")}`,
        newBindings
      );
    });
  } catch {
    // ignored
  }
}