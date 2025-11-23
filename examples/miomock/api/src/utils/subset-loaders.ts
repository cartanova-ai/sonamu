import type { SubsetQuery } from "sonamu";

export function getSubsetLoaders(subsets: string[], subsetQueries: Record<string, SubsetQuery>) {
  return subsets.reduce(
    (acc, subset) => {
      acc[subset] = subsetQueries[subset]?.loaders ?? [];
      return acc;
    },
    {} as Record<string, SubsetQuery["loaders"]>,
  );
}
