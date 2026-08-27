import { type SubsetQuery } from "sonamu";

export function getSubsetLoaders(
  subsets: string[],
  subsetQueries: Record<string, SubsetQuery>,
): Record<string, SubsetQuery["loaders"]> {
  return Object.fromEntries(
    subsets.map((subset) => [subset, subsetQueries[subset]?.loaders ?? []]),
  );
}
