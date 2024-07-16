import _ from "lodash";
import { ExtendedEntity } from "../services/sonamu-ui.service";
import { useCallback, useState } from "react";

class InvertedIndex {
  private index: Map<string, Set<number>>;

  constructor() {
    this.index = new Map();
  }

  addToIndex(ngram: string, docId: number) {
    if (!this.index.has(ngram)) {
      this.index.set(ngram, new Set());
    }
    this.index.get(ngram)!.add(docId);
  }

  search(ngram: string): Set<number> {
    return this.index.get(ngram) || new Set();
  }
}

type Item = Pick<
  ExtendedEntity,
  "id" | "title" | "props" | "subsets" | "enums" | "enumLabels"
>;
export type SearchResult = {
  item: Pick<Item, "id" | "title">;
  fields?: {
    type: "props" | "subsets" | "enums" | "scaffolding";
    key: string;
    desc: string;
  }[];
  score: number;
};

export function useEntitySearch(options?: {
  items?: Item[];
  ngramSize?: number;
}) {
  const [n, setN] = useState(options?.ngramSize ?? 2);
  const [items, setItems] = useState(options?.items ?? []);
  const [invertedIndex, setInvertedIndex] = useState(new InvertedIndex());

  const generateNgrams = useCallback(
    (text: string): string[] => {
      const ngrams: string[] = [];
      for (let i = 0; i <= text.length - n; i++) {
        ngrams.push(text.slice(i, i + n));
      }
      return ngrams;
    },
    [n]
  );

  const addToIndex = useCallback(
    (text: string, index: number) => {
      const ngrams = generateNgrams(text.toLowerCase());
      ngrams.forEach((ngram) => {
        invertedIndex.addToIndex(ngram, index);
      });
    },
    [generateNgrams, invertedIndex]
  );

  const buildIndex = useCallback(() => {
    const newInvertedIndex = new InvertedIndex();
    setInvertedIndex(newInvertedIndex);

    items.forEach((item, index) => {
      addToIndex(item.id, index);
      addToIndex(item.title, index);
      item.props.forEach((prop) => {
        addToIndex(prop.name, index);
        addToIndex(prop.desc!, index);
      });
      Object.values(item.subsets).forEach((subset) => {
        subset.forEach((value) => addToIndex(value, index));
      });
      Object.entries(item.enumLabels).forEach(([key, value]) => {
        addToIndex(key, index);
        // TODO: Enum 필드 추가
      });
    });
  }, [items, addToIndex]);

  const setSearchItems = useCallback(
    (newItems: Item[]) => {
      setItems(newItems);
      buildIndex();
    },
    [buildIndex]
  );

  const setNgramSize = useCallback(
    (n: number) => {
      setN(n);
      buildIndex();
    },
    [buildIndex]
  );

  const calculateFieldScore = useCallback(
    (query: string, field: string): number => {
      const lowercaseQuery = query.toLowerCase();
      const lowercaseField = field.toLowerCase();

      let score = 0;

      if (lowercaseField === lowercaseQuery) {
        score += 3; // 완전 일치에 대한 가점
      } else if (lowercaseField.includes(lowercaseQuery)) {
        score += 1; // 부분 일치
        if (lowercaseField.startsWith(lowercaseQuery)) {
          score += 0.5; // 시작 부분 일치
        }
      }

      const queryNgrams = generateNgrams(lowercaseQuery);
      const fieldNgrams = generateNgrams(lowercaseField);
      const commonNgrams = queryNgrams.filter((ngram) =>
        fieldNgrams.includes(ngram)
      );

      score +=
        commonNgrams.length / Math.max(queryNgrams.length, fieldNgrams.length);

      return score;
    },
    [generateNgrams]
  );

  const calculateItemScore = useCallback(
    (query: string, item: Item): SearchResult[] => {
      const searchResult: SearchResult[] = [];
      let maxScore = 0;

      // 엔티티 ID와 타이틀에 대한 가점
      // Id 검사
      const idScore = calculateFieldScore(query, item.id);
      if (maxScore < idScore) {
        maxScore = idScore + 0.5;
      }

      // Title 검사
      const titleScore = calculateFieldScore(query, item.title);
      if (maxScore < titleScore) {
        maxScore = titleScore + 0.5;
      }
      searchResult.push({
        item: { id: item.id, title: item.title },
        fields: [{ type: "scaffolding", key: "", desc: "" }],
        score: maxScore,
      });

      // Props 검사
      item.props.forEach((prop) => {
        const nameScore = calculateFieldScore(query, prop.name);
        const descScore = calculateFieldScore(query, prop.desc!);
        if (nameScore > 0.2 || descScore > 0.2) {
          if (maxScore < Math.max(nameScore, descScore)) {
            maxScore = Math.max(nameScore, descScore);
          }
          searchResult.push({
            item: { id: item.id, title: item.title },
            fields: [
              {
                type: "props",
                key: prop.name,
                desc: prop.desc!,
              },
            ],
            score: Math.max(nameScore, descScore),
          });
        }
      });

      // Subsets 검사
      Object.entries(item.subsets).forEach(([key, values]) => {
        const matchedValues = values.filter(
          (value) => calculateFieldScore(query, value) > 0.2
        );
        if (matchedValues.length > 0) {
          const maxSubsetScore = Math.max(
            ...matchedValues.map((value) => calculateFieldScore(query, value))
          );
          if (maxScore < maxSubsetScore) {
            maxScore = maxSubsetScore;
          }
          matchedValues.forEach((value) => {
            searchResult.push({
              item: { id: item.id, title: item.title },
              fields: [
                {
                  type: "subsets",
                  key,
                  desc: value,
                },
              ],
              score: maxSubsetScore,
            });
          });
        }
      });

      // Enums 검사
      Object.entries(item.enumLabels).forEach(([key, value]) => {
        const keyScore = calculateFieldScore(query, key);
        if (keyScore > 0.2) {
          if (maxScore < keyScore) {
            maxScore = keyScore;
          }
          searchResult.push({
            item: { id: item.id, title: item.title },
            fields: [
              {
                type: "enums",
                key,
                desc: "",
              },
            ],
            score: keyScore,
          });
        }
      });

      return searchResult;
    },
    [calculateFieldScore]
  );

  const search = useCallback(
    (query: string, currentEntity?: string): SearchResult[] => {
      const queryNgrams = generateNgrams(query.toLowerCase());
      const candidateIds = new Set<number>();

      queryNgrams.forEach((ngram) => {
        const ids = invertedIndex.search(ngram);
        ids.forEach((id) => candidateIds.add(id));
      });

      const searchResult: SearchResult[] = Array.from(candidateIds)
        .flatMap((id) => calculateItemScore(query, items[id]))
        .filter((result) => result.score > 0.1)
        .sort((a, b) => b.score - a.score);

      return _(searchResult)
        .groupBy((r) => r.item.id + Math.floor(r.score * 10) / 10)
        .map((group) => {
          const { id, title } = group[0].item;
          const fields = group
            .map(({ fields }) => fields)
            .flat()
            .filter(Boolean) as SearchResult["fields"];
          const score = Math.max(...group.map(({ score }) => score));
          return { item: { id, title }, fields, score };
        })
        .value()
        .sort((a, b) => {
          if (a.item.id === currentEntity) return -1;
          if (b.item.id === currentEntity) return 1;
          return b.score - a.score;
        })
        .reduce((acc, cur, idx) => {
          // 현재 아이템과 다음 아이템의 ID가 동일하면 합치기
          if (idx === 0) return [cur];

          const prev = acc[acc.length - 1];
          if (cur.item.id === prev.item.id) {
            prev.fields = [...(prev.fields ?? []), ...(cur.fields ?? [])];
            prev.score = Math.max(prev.score, cur.score);
          } else {
            acc.push(cur);
          }
          return acc;
        }, [] as SearchResult[]);
    },
    [generateNgrams, invertedIndex, calculateItemScore, items]
  );

  return {
    setSearchItems,
    setNgramSize,
    search,
  };
}
