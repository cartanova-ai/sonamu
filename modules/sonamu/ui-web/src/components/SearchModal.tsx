import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@sonamu-kit/react-components";
import { useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useMemo, useState } from "react";

import { SonamuUIService } from "../services/sonamu-ui.service";

const SCORE_THRESHOLD = 0.3;
const HIGHLIGHT_CLASS = "bg-amber-200/60 text-amber-900 rounded-sm";

type FuzzyResult = { score: number; indices: number[] };

/**
 * Subsequence 기반 fuzzy 매칭.
 * 검색어의 각 문자가 순서대로 대상 문자열에 존재하는지 확인하고,
 * 매칭 품질에 따른 스코어(0~1)와 매칭된 문자 인덱스 배열을 반환합니다.
 *
 * 스코어링 기준:
 * - 연속 매칭: 1.0 (문자가 바로 이어짐)
 * - 단어 경계 매칭: 0.8 (_, 공백, 대소문자 전환 직후)
 * - 갭 매칭: 0.1 (그 외)
 */
function fuzzyMatch(text: string, search: string): FuzzyResult | null {
  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();

  if (lowerSearch.length === 0) return null;
  if (lowerSearch.length > lowerText.length) return null;

  // substring 매칭이면 최고 스코어
  const subIdx = lowerText.indexOf(lowerSearch);
  if (subIdx !== -1) {
    const indices = Array.from({ length: lowerSearch.length }, (_, i) => subIdx + i);
    return { score: 1.0, indices };
  }

  // subsequence 매칭
  const indices: number[] = [];
  let searchIdx = 0;
  for (let i = 0; i < lowerText.length && searchIdx < lowerSearch.length; i++) {
    if (lowerText[i] === lowerSearch[searchIdx]) {
      indices.push(i);
      searchIdx++;
    }
  }

  // 전체 매칭 실패
  if (searchIdx < lowerSearch.length) return null;

  // 스코어 계산
  let totalScore = 0;
  for (let j = 0; j < indices.length; j++) {
    const idx = indices[j];
    if (j > 0 && idx === indices[j - 1] + 1) {
      totalScore += 1.0;
    } else if (idx === 0 || isWordBoundary(text, idx)) {
      totalScore += 0.8;
    } else {
      totalScore += 0.1;
    }
  }

  const score = totalScore / indices.length;
  return { score, indices };
}

function isWordBoundary(text: string, idx: number): boolean {
  if (idx === 0) return true;
  const prev = text[idx - 1];
  const curr = text[idx];
  if (prev === "_" || prev === " " || prev === "-" || prev === ".") return true;
  if (prev === prev.toLowerCase() && curr === curr.toUpperCase() && curr !== curr.toLowerCase())
    return true;
  return false;
}

function Highlight({
  text,
  search,
  indices,
}: {
  text: string;
  search: string;
  indices?: number[];
}) {
  if (!search) return <span>{text}</span>;

  const matchIndices = indices ?? fuzzyMatch(text, search)?.indices;
  if (!matchIndices || matchIndices.length === 0) return <span>{text}</span>;

  // substring 매칭인지 확인 (인덱스가 연속이면 substring)
  const isContiguous = matchIndices.every((idx, i) => i === 0 || idx === matchIndices[i - 1] + 1);

  if (isContiguous) {
    const start = matchIndices[0];
    const end = matchIndices[matchIndices.length - 1] + 1;
    return (
      <span>
        {text.slice(0, start)}
        <span className={HIGHLIGHT_CLASS}>{text.slice(start, end)}</span>
        {text.slice(end)}
      </span>
    );
  }

  // fuzzy: 개별 문자 하이라이팅
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  for (const i of matchIndices) {
    if (i > lastIdx) {
      parts.push(text.slice(lastIdx, i));
    }
    parts.push(
      <span key={i} className={HIGHLIGHT_CLASS}>
        {text[i]}
      </span>,
    );
    lastIdx = i + 1;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return <span>{parts}</span>;
}

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};

function scrollToElement(id: string): void {
  let attempts = 0;
  const maxAttempts = 50;
  const interval = setInterval(() => {
    attempts++;
    const element = document.getElementById(id);
    if (element) {
      clearInterval(interval);
      element.scrollIntoView({ behavior: "instant", block: "center" });
      element.style.backgroundColor = "#fef3c7";
      element.style.boxShadow = "0 0 0 2px #fbbf24";
      setTimeout(() => {
        element.style.backgroundColor = "";
        element.style.boxShadow = "";
        element.style.transition = "background-color 1s, box-shadow 1s";
      }, 1000);
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 100);
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { data } = SonamuUIService.useEntities();
  const { entities } = data ?? {};

  const filteredEntities = useMemo(() => {
    if (!entities) return [];
    if (!search) return [];

    return entities
      .map((entity) => {
        const entityResult = fuzzyMatch(`${entity.id} ${entity.title}`, search);
        const entityMatch = entityResult !== null && entityResult.score >= SCORE_THRESHOLD;
        const matchedProps = entity.props.filter((prop) => {
          const r = fuzzyMatch(`${prop.name} ${prop.desc ?? ""}`, search);
          return r !== null && r.score >= SCORE_THRESHOLD;
        });
        const matchedSubsets = Object.entries(entity.subsets).flatMap(([subsetKey, fields]) =>
          fields
            .filter((field) => {
              const r = fuzzyMatch(`${subsetKey} ${field}`, search);
              return r !== null && r.score >= SCORE_THRESHOLD;
            })
            .map((field) => ({ subsetKey, field })),
        );
        const matchedEnums = Object.keys(entity.enumLabels).filter((enumKey) => {
          const r = fuzzyMatch(enumKey, search);
          return r !== null && r.score >= SCORE_THRESHOLD;
        });

        if (
          entityMatch ||
          matchedProps.length > 0 ||
          matchedSubsets.length > 0 ||
          matchedEnums.length > 0
        ) {
          // 이 엔티티에서 가장 높은 매칭 스코어를 계산합니다.
          // entityResult는 이미 위에서 계산되어 있으므로 재사용합니다.
          const bestScore = Math.max(
            entityResult?.score ?? 0,
            ...matchedProps.map(
              (prop) => fuzzyMatch(`${prop.name} ${prop.desc ?? ""}`, search)?.score ?? 0,
            ),
            ...matchedSubsets.map(
              ({ subsetKey, field }) => fuzzyMatch(`${subsetKey} ${field}`, search)?.score ?? 0,
            ),
            ...matchedEnums.map((enumKey) => fuzzyMatch(enumKey, search)?.score ?? 0),
          );
          return {
            entity,
            entityMatch,
            matchedProps,
            matchedSubsets,
            matchedEnums,
            bestScore,
          };
        }
        return null;
      })
      .filter(Boolean)
      .toSorted((a, b) => (b?.bestScore ?? 0) - (a?.bestScore ?? 0));
  }, [entities, search]);

  const handleSelect = (url: string, elementId?: string) => {
    setSearch("");
    onClose();
    navigate({ to: url });
    if (elementId) {
      scrollToElement(elementId);
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSearch("");
          onClose();
        }
      }}
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput placeholder="Search entities..." value={search} onValueChange={setSearch} />
      <CommandList className="max-h-[60vh]">
        {search && filteredEntities.length === 0 && (
          <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
        )}
        {filteredEntities.map((item) => {
          if (!item) return null;
          const { entity, entityMatch, matchedProps, matchedSubsets, matchedEnums } = item;

          return (
            <CommandGroup
              key={entity.id}
              heading={<Highlight text={`${entity.id} ${entity.title}`} search={search} />}
            >
              {entityMatch && (
                <>
                  <CommandItem
                    value={`entity:${entity.id} ${entity.title}`}
                    onSelect={() => handleSelect(`/entities/${entity.id}`)}
                  >
                    <Highlight text={`${entity.id} (${entity.title})`} search={search} />
                  </CommandItem>
                  <CommandItem
                    value={`scaffolding:${entity.id} ${entity.title}`}
                    onSelect={() => handleSelect("/scaffolding", entity.id)}
                  >
                    Scaffolding &gt;{" "}
                    <Highlight text={`${entity.id}(${entity.title})`} search={search} />
                  </CommandItem>
                </>
              )}

              {matchedProps.map((prop) => (
                <CommandItem
                  key={`prop-${prop.name}`}
                  value={`prop:${prop.name} ${prop.desc ?? ""} ${entity.id}`}
                  onSelect={() => handleSelect(`/entities/${entity.id}`, `prop-${prop.name}`)}
                >
                  prop &gt; <Highlight text={prop.name} search={search} />
                  {prop.desc ? (
                    <span>
                      {" ("}
                      <Highlight text={prop.desc} search={search} />
                      {")"}
                    </span>
                  ) : null}
                </CommandItem>
              ))}

              {matchedSubsets.map(({ subsetKey, field }) => (
                <CommandItem
                  key={`subset-${subsetKey}-${field}`}
                  value={`subset:${subsetKey} ${field} ${entity.id}`}
                  onSelect={() => handleSelect(`/entities/${entity.id}`, field)}
                >
                  Subset{subsetKey} &gt; <Highlight text={field} search={search} />
                </CommandItem>
              ))}

              {matchedEnums.map((enumKey) => (
                <CommandItem
                  key={`enum-${enumKey}`}
                  value={`enum:${enumKey} ${entity.id}`}
                  onSelect={() => handleSelect(`/entities/${entity.id}`, `enum-${enumKey}`)}
                >
                  enum &gt; <Highlight text={enumKey} search={search} />
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
