export function wrapIf(
  source: string,
  predicate: (str: string) => [boolean, string]
): string {
  const [ok, wrapped] = predicate(source);
  return ok ? wrapped : source;
}
