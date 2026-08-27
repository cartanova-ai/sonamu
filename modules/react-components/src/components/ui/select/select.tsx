import { isObject } from "radashi";
import * as React from "react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import CheckIcon from "~icons/lucide/check";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import Loader2Icon from "~icons/lucide/loader2";
import XIcon from "~icons/lucide/x";
import XCircleIcon from "~icons/lucide/x-circle";

import { useSonamuBaseContext } from "@/contexts";

import { cn } from "../../../lib/utils";
import { Badge } from "../badge";
import { Button } from "../button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../command";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Separator } from "../separator";

// ============================================================================
// Type Definition
// ============================================================================

// 아이템 요소에서 value 타입 추출
type ExtractValue<Item> = Item extends { value: infer V } ? V : Item;

// 아이템 정의: 값만 넘기거나 { value, label, disabled } 형태로 넘길 수 있음
type SelectItemDef<V> = V | { value: V; label?: React.ReactNode; disabled?: boolean };

// 정규화된 아이템 타입
type NormalizedItem<V> = { value: V; label?: React.ReactNode; disabled?: boolean };

// 기본 Props
interface SelectPropsBase<Item> {
  items: Item[];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  renderItem?: (value: ExtractValue<Item>) => React.ReactNode;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLSelectElement>;
}

// valueKey 조건부 필수화: string | number일 때는 선택적, 그 외에는 필수
type SelectPropsWithValueKey<Item> =
  ExtractValue<Item> extends string | number
    ? { valueKey?: (value: ExtractValue<Item>) => string }
    : { valueKey: (value: ExtractValue<Item>) => string };

// Single-Sync Props
interface SingleSyncProps<Item> {
  multiple?: false;
  async?: false;
  value?: ExtractValue<Item>;
  onValueChange?: (value: ExtractValue<Item> | undefined) => void;
  searchable?: boolean;
}

// Single-Async Props
interface SingleAsyncProps<Item> {
  multiple?: false;
  async: true;
  value?: ExtractValue<Item>;
  onValueChange?: (value: ExtractValue<Item> | undefined) => void;
  loading?: boolean;
  error?: Error;
  onSearch: (keyword: string) => void;
  searchDebounce?: number;
  // 검색창 노출 여부. 기본은 true (async의 기존 UX 유지). false면 CommandInput을 숨깁니다.
  searchable?: boolean;
  // Popover/무한스크롤 훅: async 사용처에서만 의미가 있어 async props로 한정합니다.
  onOpenChange?: (open: boolean) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

// Multi-Sync Props
interface MultiSyncProps<Item> {
  multiple: true;
  async?: false;
  value: ExtractValue<Item>[];
  onValueChange: (value: ExtractValue<Item>[]) => void;
  maxCount?: number;
  hideSelectAll?: boolean;
  searchable?: boolean;
}

// Multi-Async Props
interface MultiAsyncProps<Item> {
  multiple: true;
  async: true;
  value: ExtractValue<Item>[];
  onValueChange: (value: ExtractValue<Item>[]) => void;
  loading?: boolean;
  error?: Error;
  onSearch: (keyword: string) => void;
  searchDebounce?: number;
  maxCount?: number;
  hideSelectAll?: boolean;
  // 검색창 노출 여부. 기본은 true (async의 기존 UX 유지). false면 CommandInput을 숨깁니다.
  searchable?: boolean;
  // Popover/무한스크롤 훅: async 사용처에서만 의미가 있어 async props로 한정합니다.
  onOpenChange?: (open: boolean) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

// 통합 타입
type SelectProps<Item> = SelectPropsBase<Item> &
  SelectPropsWithValueKey<Item> &
  (SingleSyncProps<Item> | SingleAsyncProps<Item> | MultiSyncProps<Item> | MultiAsyncProps<Item>);

// ============================================================================
// Internal Types
// ============================================================================

type CommonState<Item> = {
  // multi 모드 플래그
  isMultiple: boolean;
  // async 모드 플래그
  isAsync: boolean;
  // 숨겨진 native select ref
  selectRef: React.RefObject<HTMLSelectElement | null>;
  // Popover 상태
  isPopoverOpen: boolean;
  setIsPopoverOpen: (open: boolean) => void;
  // 검색 상태
  searchValue: string;
  handleSearchChange: (value: string) => void;
  // 렌더링 옵션 (async: reserved 포함)
  filteredOptions: NormalizedItem<ExtractValue<Item>>[];
  // 입력 아이템 정규화 결과
  normalizedItems: NormalizedItem<ExtractValue<Item>>[];
  // 값 → 키 변환
  getKeyForValue: (val: ExtractValue<Item>) => string;
  // 키 → 값 변환
  valueByKey: Map<string, ExtractValue<Item>>;
  // 값 → 라벨 변환
  getItemLabel: (value: ExtractValue<Item>) => React.ReactNode;
};

type CommandBasedSelectProps<Item> = {
  props: (
    | SingleSyncProps<Item>
    | SingleAsyncProps<Item>
    | MultiSyncProps<Item>
    | MultiAsyncProps<Item>
  ) &
    SelectPropsBase<Item> &
    SelectPropsWithValueKey<Item>;
  isMultiple: boolean;
  isAsync: boolean;
  isPopoverOpen: boolean;
  setIsPopoverOpen: (open: boolean) => void;
  searchValue: string;
  handleSearchChange: (value: string) => void;
  filteredOptions: NormalizedItem<ExtractValue<Item>>[];
  getKeyForValue: (val: ExtractValue<Item>) => string;
  getItemLabel: (value: ExtractValue<Item>) => React.ReactNode;
};

// ============================================================================
// Type Guard
// ============================================================================

// 아이템이 { value, label, disabled } 형태인지 확인
function isItemObject<V>(
  item: V | { value: V; label?: React.ReactNode; disabled?: boolean },
): item is { value: V; label?: React.ReactNode; disabled?: boolean } {
  return isObject(item) && "value" in item;
}

function normalizeItem<Item>(item: Item): NormalizedItem<ExtractValue<Item>> {
  // SAFETY: 객체 분기는 value 속성을 직접 검사했고, 값 분기는 ExtractValue가 Item 자체로 귀결됩니다.
  return isItemObject(item)
    ? (item as NormalizedItem<ExtractValue<Item>>)
    : { value: item as ExtractValue<Item> };
}

type LabelCacheBoundaryProps = {
  labels: ReadonlyMap<string, React.ReactNode>;
  selectedKeys: ReadonlySet<string>;
  valueKeyIdentity: object | undefined;
  children: (labels: ReadonlyMap<string, React.ReactNode>) => React.ReactNode;
};

type LabelCacheBoundaryState = {
  labels: ReadonlyMap<string, React.ReactNode>;
  valueKeyIdentity: object | undefined;
};

class LabelCacheBoundary extends React.Component<LabelCacheBoundaryProps, LabelCacheBoundaryState> {
  state: LabelCacheBoundaryState = {
    labels: new Map(),
    valueKeyIdentity: this.props.valueKeyIdentity,
  };

  static getDerivedStateFromProps(
    props: LabelCacheBoundaryProps,
    state: LabelCacheBoundaryState,
  ): LabelCacheBoundaryState | null {
    const valueKeyChanged = props.valueKeyIdentity !== state.valueKeyIdentity;
    const labels = new Map(props.labels);

    // 비동기 검색 결과에서 사라진 선택 항목도 마지막으로 확인한 라벨을 유지합니다.
    if (!valueKeyChanged) {
      for (const key of props.selectedKeys) {
        const cachedLabel = state.labels.get(key);
        if (!labels.has(key) && cachedLabel !== undefined) labels.set(key, cachedLabel);
      }
    }

    const unchanged =
      !valueKeyChanged &&
      labels.size === state.labels.size &&
      Array.from(labels).every(([key, label]) => state.labels.get(key) === label);

    return unchanged ? null : { labels, valueKeyIdentity: props.valueKeyIdentity };
  }

  render() {
    return this.props.children(this.state.labels);
  }
}

// ============================================================================
// Hooks & Renderers
// ============================================================================

function useSelectCommon<Item>(
  props: SelectProps<Item>,
  ref: React.ForwardedRef<HTMLSelectElement>,
  cachedLabels: ReadonlyMap<string, React.ReactNode>,
): CommonState<Item> {
  type Value = ExtractValue<Item>;

  // 모드 파생
  const isMultiple = props.multiple === true;
  const isAsync = props.async === true;
  const valueKey = props.valueKey;
  const selectedValues = props.multiple ? props.value : undefined;
  const selectedValue = props.multiple ? undefined : props.value;
  const renderItem = props.renderItem;

  // native select 연결
  const selectRef = useRef<HTMLSelectElement>(null);
  useImperativeHandle(ref, () => {
    const element = selectRef.current;
    if (!element) throw new Error("Select 요소가 아직 마운트되지 않았습니다.");
    return element;
  });

  // popover + 검색 상태
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Popover 열림/닫힘 전이 감지해 외부 onOpenChange 콜백 발사. async 모드에서만 의미가 있습니다.
  // 실제 값 변화가 있을 때만 트리거하여 불필요한 호출을 피합니다.
  const onOpenChangeExternal = isAsync && "onOpenChange" in props ? props.onOpenChange : undefined;
  const prevOpenRef = useRef(isPopoverOpen);
  useEffect(() => {
    if (prevOpenRef.current !== isPopoverOpen) {
      if (onOpenChangeExternal) {
        onOpenChangeExternal(isPopoverOpen);
      }
      prevOpenRef.current = isPopoverOpen;
    }
  }, [isPopoverOpen, onOpenChangeExternal]);

  // 값 → 키 변환
  const getKeyForValue = useCallback(
    (val: Value): string => {
      if (val === undefined || val === null) return "";
      if (valueKey) return valueKey(val);
      return String(val);
    },
    [valueKey],
  );

  // 아이템 정규화
  const normalizedItems = useMemo(() => {
    return props.items.map(normalizeItem);
  }, [props.items]);

  // 키 → 값 매핑 (Single-Sync 모드용)
  const valueByKey = useMemo(() => {
    const mapping = new Map<string, Value>();
    for (const item of normalizedItems) {
      mapping.set(getKeyForValue(item.value), item.value);
    }
    return mapping;
  }, [normalizedItems, getKeyForValue]);

  // Async 모드: 현재 선택된 옵션을 검색 결과와 함께 유지
  const reservedOptions = useMemo(() => {
    if (!isAsync) return new Map<string, NormalizedItem<Value>>();

    const values = selectedValues
      ? selectedValues
      : selectedValue === undefined || selectedValue === null
        ? []
        : [selectedValue];

    const next = new Map<string, NormalizedItem<Value>>();

    // 선택된 값들만 캐시에 저장
    for (const val of values) {
      const key = getKeyForValue(val);
      const matchingItem = normalizedItems.find((candidate) => candidate.value === val);
      if (matchingItem) {
        next.set(key, matchingItem);
      } else {
        const label = cachedLabels.get(key);
        if (label !== undefined) {
          next.set(key, { value: val, label });
        }
      }
    }

    return next;
  }, [isAsync, selectedValues, selectedValue, normalizedItems, getKeyForValue, cachedLabels]);

  // 값 → 라벨 렌더링
  const getItemLabel = useCallback(
    (value: Value): React.ReactNode => {
      // renderItem이 있으면 바로 사용 (대부분의 경우 여기서 종료)
      if (renderItem) {
        return renderItem(value);
      }

      // label 찾기: normalizedItems에서 먼저 확인
      const item = normalizedItems.find((i) => i.value === value);
      if (item?.label !== undefined) {
        return item.label;
      }

      // async 모드면 이전 검색 결과에서 확인한 라벨도 사용
      if (isAsync) {
        const cachedLabel = cachedLabels.get(getKeyForValue(value));
        if (cachedLabel !== undefined) {
          return cachedLabel;
        }
      }

      // 마지막 폴백: String 변환
      return String(value);
    },
    [renderItem, normalizedItems, isAsync, cachedLabels, getKeyForValue],
  );

  // 검색어 변경
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handlePopoverOpenChange = useCallback((open: boolean) => {
    setIsPopoverOpen(open);
    if (!open) {
      setSearchValue("");
    }
  }, []);

  // 검색 디바운스
  const onSearchFn = isAsync && "onSearch" in props ? props.onSearch : undefined;
  const searchDebounceTime =
    isAsync && "searchDebounce" in props && props.searchDebounce !== undefined
      ? props.searchDebounce
      : 300;

  useEffect(() => {
    if (!onSearchFn) return;

    // 빈 문자열(검색어 삭제 / 팝오버 닫힘으로 인한 초기화)은 즉시 전파하여
    // 부모의 keyword state를 리셋합니다. 이렇게 해야 "검색어 비움 → 초기 리스트"와
    // "선택 후 재오픈 → 초기 리스트" 동작이 성립합니다. 비어 있지 않은 입력만
    // 디바운스합니다.
    const timer = setTimeout(
      () => {
        onSearchFn(searchValue);
      },
      searchValue === "" ? 0 : searchDebounceTime,
    );

    return () => clearTimeout(timer);
  }, [searchValue, onSearchFn, searchDebounceTime]);

  // 표시할 옵션: async는 검색 결과 + reserved, sync는 로컬 필터링
  const filteredOptions = useMemo(() => {
    if (isAsync) {
      const combined = new Map<string, NormalizedItem<Value>>();

      for (const [key, item] of reservedOptions) {
        combined.set(key, item);
      }

      for (const item of normalizedItems) {
        combined.set(getKeyForValue(item.value), item);
      }

      return Array.from(combined.values());
    } else {
      if (!searchValue) return normalizedItems;

      return normalizedItems.filter((item) => {
        const label = getItemLabel(item.value);
        return String(label).toLowerCase().includes(searchValue.toLowerCase());
      });
    }
  }, [isAsync, normalizedItems, reservedOptions, searchValue, getKeyForValue, getItemLabel]);

  return {
    isMultiple,
    isAsync,
    selectRef,
    isPopoverOpen,
    setIsPopoverOpen: handlePopoverOpenChange,
    searchValue,
    handleSearchChange,
    filteredOptions,
    normalizedItems,
    getKeyForValue,
    valueByKey,
    getItemLabel,
  };
}

// ============================================================================
// CommandBasedSelect
// - 모든 모드를 처리하는 통합 Command Popover UI
// ============================================================================
function highlightMatch(label: React.ReactNode, searchTerm: string): React.ReactNode {
  if (!searchTerm || Object.prototype.toString.call(label) !== "[object String]") {
    return label;
  }

  const text = String(label);

  const lowerLabel = text.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();
  const idx = lowerLabel.indexOf(lowerSearch);

  if (idx === -1) {
    return label;
  }

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + searchTerm.length);
  const after = text.slice(idx + searchTerm.length);

  return (
    <>
      {before}
      <strong className="font-bold">{match}</strong>
      {after}
    </>
  );
}

function CommandBasedSelect<Item>({
  props,
  isMultiple,
  isAsync,
  isPopoverOpen,
  setIsPopoverOpen,
  searchValue,
  handleSearchChange,
  filteredOptions,
  getKeyForValue,
  getItemLabel,
}: CommandBasedSelectProps<Item>) {
  type Value = ExtractValue<Item>;
  const { SD } = useSonamuBaseContext();

  // Popover portal 마운트 타이밍 때문에 ref 콜백 + state 조합으로 DOM 노드를 구독합니다.
  // useRef만 쓰면 첫 렌더 시 null이고 이후 재렌더 트리거가 없어 IntersectionObserver effect가
  // 등록되지 않습니다.
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const listRefCallback = useCallback((node: HTMLDivElement | null) => {
    setListEl(node);
  }, []);
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelRefCallback = useCallback((node: HTMLDivElement | null) => {
    setSentinelEl(node);
  }, []);

  // 무한스크롤 관련 props 추출. async 전용 prop이므로 async 모드에서만 끌어옵니다.
  const onLoadMore = isAsync && "onLoadMore" in props ? props.onLoadMore : undefined;
  const hasMore = isAsync && "hasMore" in props ? (props.hasMore ?? false) : false;
  const isLoadingMore =
    isAsync && "isLoadingMore" in props ? (props.isLoadingMore ?? false) : false;
  // 센티넬 렌더 여부: async + 호출자가 onLoadMore를 제공했을 때만 DOM을 붙이고 관찰합니다.
  const hasInfiniteScroll = isAsync && onLoadMore !== undefined;

  // 센티넬이 뷰포트(listEl)에 진입하면 onLoadMore 호출. 로딩 중이거나 더 불러올 게 없으면 관찰하지 않습니다.
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore) {
      return;
    }
    if (!sentinelEl || !listEl) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore();
          }
        }
      },
      { root: listEl, threshold: 0 },
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl, listEl, onLoadMore, hasMore, isLoadingMore]);

  // 검색창 노출 여부: searchable을 async/sync와 직교 축으로 다룹니다.
  // 명시되지 않으면 기존 동작(async=true이면 true, sync면 false)을 유지합니다.
  const isSearchable = props.searchable ?? isAsync;

  // Wheel 이벤트 핸들러
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const target = listEl;
      if (!target) {
        return;
      }

      const canScrollDown = target.scrollTop < target.scrollHeight - target.clientHeight;
      const canScrollUp = target.scrollTop > 0;

      if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
        e.stopPropagation();
      }
    },
    [listEl],
  );

  // 선택 토글 (single/multi 공용)
  const toggleOption = useCallback(
    (value: Value) => {
      if (props.disabled) return;

      if (props.multiple) {
        const currentValues = props.value;
        const newValues = currentValues.includes(value)
          ? currentValues.filter((v) => v !== value)
          : [...currentValues, value];
        props.onValueChange(newValues);
      } else {
        props.onValueChange?.(value);
        setIsPopoverOpen(false);
      }
    },
    [props, setIsPopoverOpen],
  );

  // 전체 선택 토글 (multi만)
  const toggleAll = useCallback(() => {
    if (!props.multiple || props.disabled) return;

    const allOptions = filteredOptions.filter((option) => !option.disabled);
    const currentValues = props.value;

    if (currentValues.length === allOptions.length) {
      props.onValueChange([]);
    } else {
      const allValues = allOptions.map((option) => option.value);
      props.onValueChange(allValues);
    }
  }, [props, filteredOptions]);

  // Clear 처리
  const handleClear = useCallback(() => {
    if (props.disabled) return;

    if (props.multiple) {
      props.onValueChange([]);
    } else {
      props.onValueChange?.(undefined);
    }
  }, [props]);

  // 선택 여부 확인
  const isSelected = useCallback(
    (value: Value): boolean => {
      if (props.multiple) {
        return props.value.includes(value);
      } else {
        return props.value === value;
      }
    },
    [props],
  );

  // async 상태
  const loading = isAsync && "loading" in props ? props.loading : false;
  const error = isAsync && "error" in props ? props.error : undefined;
  const hasValue = props.multiple
    ? props.value.length > 0
    : props.value !== undefined && props.value !== null && props.value !== "";
  const selectedValues = props.multiple ? props.value : [];
  const selectedValue = props.multiple ? undefined : props.value;

  // Badge 렌더링 헬퍼 (multi 모드 전용)
  const renderBadges = () => {
    if (!props.multiple) return null;

    const values = props.value;

    return (
      <>
        {values.map((value) => {
          const key = getKeyForValue(value);
          return (
            <Badge
              key={key}
              variant="outline"
              className="m-1 transition-all duration-300 ease-in-out"
            >
              {getItemLabel(value)}
              <XCircleIcon
                className="ml-2 h-3 w-3 cursor-pointer !pointer-events-auto"
                onPointerDownCapture={(e) => {
                  e.stopPropagation();
                }}
                onMouseDownCapture={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOption(value);
                }}
              />
            </Badge>
          );
        })}
      </>
    );
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isPopoverOpen}
          disabled={props.disabled || loading}
          className={cn(
            "flex p-1 rounded-md border border-input min-h-10 h-auto items-center justify-between bg-white hover:bg-white hover:text-inherit [&_svg]:pointer-events-auto w-full",
            props.className,
          )}
        >
          {isMultiple && hasValue ? (
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-1 flex-wrap">{renderBadges()}</div>
              <div className="flex items-center justify-between">
                {props.clearable && (
                  <div
                    role="button"
                    tabIndex={0}
                    onPointerDownCapture={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDownCapture={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClear();
                    }}
                    className="flex items-center justify-center h-4 w-4 mx-2 cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="h-4 w-4" />
                  </div>
                )}
                <Separator orientation="vertical" className="flex min-h-6 h-full" />
                <ChevronDownIcon className="h-4 mx-2 cursor-pointer text-muted-foreground" />
              </div>
            </div>
          ) : !isMultiple && hasValue ? (
            <div className="flex justify-between items-center w-full px-2 py-1">
              {(() => {
                return selectedValue !== undefined && selectedValue !== null ? (
                  <span className="flex-1 truncate text-left text-sm">
                    {getItemLabel(selectedValue)}
                  </span>
                ) : null;
              })()}
              <div className="flex items-center gap-1 shrink-0">
                {props.clearable && hasValue && (
                  <XCircleIcon
                    className="h-4 w-4 cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                    onPointerDownCapture={handleClear}
                    onMouseDownCapture={handleClear}
                  />
                )}
                <ChevronDownIcon className="h-4 w-4 opacity-50" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full px-2 py-1">
              <span className="text-sm text-muted-foreground flex-1 truncate text-left">
                {props.placeholder}
              </span>
              <ChevronDownIcon className="h-4 cursor-pointer text-muted-foreground" />
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="min-w-40 p-0"
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command shouldFilter={false}>
          {isSearchable && (
            <CommandInput
              placeholder={SD("common.searchPlaceholder")}
              value={searchValue}
              onValueChange={handleSearchChange}
            />
          )}
          <CommandList ref={listRefCallback} onWheel={handleWheel}>
            {loading ? (
              <CommandEmpty>
                <div className="flex items-center justify-center">
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                </div>
              </CommandEmpty>
            ) : error ? (
              <CommandEmpty>Error: {error.message}</CommandEmpty>
            ) : filteredOptions.length === 0 ? (
              <CommandEmpty>{SD("rc.multiSelect.noResults")}</CommandEmpty>
            ) : (
              <>
                {isMultiple && !("hideSelectAll" in props && props.hideSelectAll) && (
                  <CommandGroup>
                    <CommandItem onSelect={toggleAll} className="cursor-pointer">
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                          selectedValues.length ===
                            filteredOptions.filter((opt) => !opt.disabled).length
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50 [&_svg]:invisible",
                        )}
                      >
                        <CheckIcon className="h-4 w-4" />
                      </div>
                      <span>({SD("rc.multiSelect.selectAll")})</span>
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup>
                  {filteredOptions.map((option) => {
                    const key = getKeyForValue(option.value);
                    const selected = isSelected(option.value);

                    return (
                      <CommandItem
                        key={key}
                        onSelect={() => toggleOption(option.value)}
                        disabled={option.disabled}
                        className={cn(
                          "cursor-pointer",
                          option.disabled && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        {isMultiple && (
                          <div
                            className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                              selected
                                ? "bg-primary text-primary-foreground"
                                : "opacity-50 [&_svg]:invisible",
                            )}
                          >
                            <CheckIcon className="h-4 w-4" />
                          </div>
                        )}
                        {!isMultiple && (
                          <CheckIcon
                            className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")}
                          />
                        )}
                        <span>{highlightMatch(getItemLabel(option.value), searchValue)}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {hasInfiniteScroll && (
                  <div
                    ref={sentinelRefCallback}
                    className="flex items-center justify-center py-2 text-xs text-muted-foreground"
                  >
                    {isLoadingMore ? <Loader2Icon className="h-3 w-3 animate-spin" /> : null}
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Main Component & Export
// ============================================================================

function SelectContent<Item>({
  props,
  forwardedRef,
  cachedLabels,
}: {
  props: SelectProps<Item>;
  forwardedRef: React.ForwardedRef<HTMLSelectElement>;
  cachedLabels: ReadonlyMap<string, React.ReactNode>;
}) {
  // 공통 상태/유틸
  const common = useSelectCommon(props, forwardedRef, cachedLabels);

  return (
    <CommandBasedSelect
      props={props}
      isMultiple={common.isMultiple}
      isAsync={common.isAsync}
      isPopoverOpen={common.isPopoverOpen}
      setIsPopoverOpen={common.setIsPopoverOpen}
      searchValue={common.searchValue}
      handleSearchChange={common.handleSearchChange}
      filteredOptions={common.filteredOptions}
      getKeyForValue={common.getKeyForValue}
      getItemLabel={common.getItemLabel}
    />
  );
}

export const Select =
  // SAFETY: forwardRef가 보존하지 못하는 Item 제네릭 호출 시그니처만 다시 선언합니다.
  React.forwardRef(function Select<Item>(
    props: SelectProps<Item>,
    ref: React.ForwardedRef<HTMLSelectElement>,
  ) {
    const labels = new Map<string, React.ReactNode>();
    for (const item of props.items) {
      const normalized = normalizeItem(item);
      if (normalized.label === undefined) continue;
      const key = props.valueKey ? props.valueKey(normalized.value) : String(normalized.value);
      labels.set(key, normalized.label);
    }

    const selectedValues = props.multiple
      ? props.value
      : props.value === undefined || props.value === null
        ? []
        : [props.value];
    const selectedKeys = new Set(
      selectedValues.map((value) => (props.valueKey ? props.valueKey(value) : String(value))),
    );

    return (
      <LabelCacheBoundary
        labels={labels}
        selectedKeys={selectedKeys}
        valueKeyIdentity={props.valueKey}
      >
        {(cachedLabels) => (
          <SelectContent props={props} forwardedRef={ref} cachedLabels={cachedLabels} />
        )}
      </LabelCacheBoundary>
    );
  }) as <Item>(
    props: SelectProps<Item> & React.RefAttributes<HTMLSelectElement>,
  ) => React.ReactElement;

export type { SelectProps, SelectItemDef, ExtractValue };
