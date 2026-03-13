/** camelCase를 사람이 읽기 좋은 형태로 변환 */
export const humanize = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
