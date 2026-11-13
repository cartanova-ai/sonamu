// Bounded so applications that create and drop schemas cannot grow it; evicts the least recently used.

export const STATEMENT_CACHE_CAPACITY = 16;

export interface SchemaStatementCache<T> {
  get(schema: string): T;
  size(): number;
}

export function createSchemaStatementCache<T>(
  render: (schema: string) => T,
  capacity: number = STATEMENT_CACHE_CAPACITY,
): SchemaStatementCache<T> {
  const entries = new Map<string, T>();
  return {
    get(schema) {
      const found = entries.get(schema);
      if (found !== undefined) {
        entries.delete(schema);
        entries.set(schema, found);
        return found;
      }
      const rendered = render(schema);
      entries.set(schema, rendered);
      while (entries.size > capacity) {
        const oldest = entries.keys().next();
        if (oldest.done === true) break;
        entries.delete(oldest.value);
      }
      return rendered;
    },
    size: () => entries.size,
  };
}
