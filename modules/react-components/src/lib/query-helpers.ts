import type { InfiniteData } from "@tanstack/react-query";

type InfinitePage<TRow> = { rows: TRow[]; total: number };
type DedupedInfiniteData<TRow> = InfiniteData<InfinitePage<TRow>> & {
  rows: TRow[];
  total: number;
};

/**
 * useInfiniteQuery의 select에 꽂아 pages/pageParams 원본은 유지하면서
 * 평탄화된 rows와 첫 페이지의 total을 data에 함께 노출합니다.
 * 각 row가 id를 갖는 경우 id 기준으로 중복 제거합니다. id가 없으면 그대로 유지합니다.
 */
export function dedupeAndFlatten<TRow extends { id?: unknown }>(
  data: InfiniteData<InfinitePage<TRow>>,
): DedupedInfiniteData<TRow> {
  const seen = new Set<unknown>();
  const rows: TRow[] = [];
  for (const page of data.pages) {
    for (const row of page?.rows ?? []) {
      const id = row?.id;
      if (id != null) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
      }
      rows.push(row);
    }
  }
  const total = data.pages[0]?.total ?? 0;
  return {
    pages: data.pages,
    pageParams: data.pageParams,
    rows,
    total,
  };
}
