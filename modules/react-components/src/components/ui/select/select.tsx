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
  setIsPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  setIsPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  return item !== null && typeof item === "object" && "value" in item;
}

// ============================================================================
// Hooks & Renderers
// ============================================================================

function useSelectCommon<Item>(
  props: SelectProps<Item>,
  ref: React.ForwardedRef<HTMLSelectElement>,
): CommonState<Item> {
  type Value = ExtractValue<Item>;

  // 모드 파생
  const isMultiple = props.multiple === true;
  const isAsync = props.async === true;

  // native select 연결
  const selectRef = useRef<HTMLSelectElement>(null);
  useImperativeHandle(ref, () => selectRef.current as HTMLSelectElement);

  // popover + 검색 상태
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  // async 모드에서 선택된 옵션 캐시
  const [reservedOptions, setReservedOptions] = useState(
    new Map(),
  );

  // 값 → 키 변환
  const getKeyForValue = useCallback(
    (val: Value): string => {
      if (val === undefined || val === null) return "";
      if (props.valueKey) return props.valueKey(val);
      return String(val);
    },
    [props.valueKey],
  );

  // 아이템 정규화
  const normalizedItems = useMemo(() => {
    return props.items.map(
      (item): NormalizedItem<Value> =>
        isItemObject(item) ? (item as NormalizedItem<Value>) : { value: item as Value },
    );
  }, [props.items]);

  // 키 → 값 매핑 (Single-Sync 모드용)
  const valueByKey = useMemo(() => {
    const mapping = new Map<string, Value>();
    for (const item of normalizedItems) {
      mapping.set(getKeyForValue(item.value), item.value);
    }
    return mapping;
  }, [normalizedItems, getKeyForValue]);

  // 값 → 라벨 렌더링
  const getItemLabel = useCallback(
    (value: Value): React.ReactNode => {
      // renderItem이 있으면 바로 사용 (대부분의 경우 여기서 종료)
      if (props.renderItem) {
        return props.renderItem(value);
      }

      // label 찾기: normalizedItems에서 먼저 확인
      const item = normalizedItems.find((i) => i.value === value);
      if (item?.label !== undefined) {
        return item.label;
      }

      // async 모드면 reservedOptions에서도 확인
      if (isAsync) {
        const cached = reservedOptions.get(getKeyForValue(value));
        if (cached?.label !== undefined) {
          return cached.label;
        }
      }

      // 마지막 폴백: String 변환
      return String(value);
    },
    [props.renderItem, normalizedItems, isAsync, reservedOptions, getKeyForValue],
  );

  // Async 모드: 선택된 옵션을 캐시에 저장
  useEffect(() => {
    if (!isAsync) return;

    // 현재 선택된 값들 추출
    const values = isMultiple
      ? (props as MultiAsyncProps<Item>).value
      : [(props as SingleAsyncProps<Item>).value as Value].filter(Boolean);

    const next = new Map<string, NormalizedItem<Value>>();

    // 선택된 값들만 캐시에 저장
    for (const val of values) {
      const key = getKeyForValue(val);
      const item = normalizedItems.find((item) => item.value === val);
      if (item) {
        next.set(key, item);
      }
    }

    setReservedOptions(next);
  }, [isAsync, isMultiple, props, normalizedItems, getKeyForValue]);

  // 검색어 변경
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  // 검색 디바운스
  const onSearchFn = isAsync && "onSearch" in props ? props.onSearch : undefined;
  const searchDebounceTime =
    isAsync && "searchDebounce" in props && props.searchDebounce !== undefined
      ? props.searchDebounce
      : 300;

  useEffect(() => {
    if (!onSearchFn || searchValue === "") return;

    const timer = setTimeout(() => {
      onSearchFn(searchValue);
    }, searchDebounceTime);

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

  // Popover 닫힐 때 검색어 초기화
  useEffect(() => {
    if (!isPopoverOpen) {
      setSearchValue("");
    }
  }, [isPopoverOpen]);

  return {
    isMultiple,
    isAsync,
    selectRef,
    isPopoverOpen,
    setIsPopoverOpen,
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
  const commandListRef = useRef<HTMLDivElement>(null);

  // 검색 가능 여부 판단: Async면 무조건 true, Sync면 searchable 값 사용
  const isSearchable = isAsync || ("searchable" in props && props.searchable === true);

  // Wheel 이벤트 핸들러
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const target = commandListRef.current;
    if (!target) return;

    const canScrollDown = target.scrollTop < target.scrollHeight - target.clientHeight;
    const canScrollUp = target.scrollTop > 0;

    if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
      e.stopPropagation();
    }
  }, []);

  // 선택 토글 (single/multi 공용)
  const toggleOption = useCallback(
    (value: Value) => {
      if (props.disabled) return;

      if (isMultiple) {
        const currentValues = (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).value;
        const newValues = currentValues.includes(value)
          ? currentValues.filter((v) => v !== value)
          : [...currentValues, value];
        (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).onValueChange(newValues);
      } else {
        (props as SingleSyncProps<Item> | SingleAsyncProps<Item>).onValueChange?.(value);
        setIsPopoverOpen(false);
      }
    },
    [isMultiple, props, setIsPopoverOpen],
  );

  // 전체 선택 토글 (multi만)
  const toggleAll = useCallback(() => {
    if (!isMultiple || props.disabled) return;

    const allOptions = filteredOptions.filter((option) => !option.disabled);
    const currentValues = (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).value;

    if (currentValues.length === allOptions.length) {
      (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).onValueChange([]);
    } else {
      const allValues = allOptions.map((option) => option.value);
      (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).onValueChange(allValues);
    }
  }, [isMultiple, props, filteredOptions]);

  // Clear 처리
  const handleClear = useCallback(() => {
    if (props.disabled) return;

    if (isMultiple) {
      (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).onValueChange([]);
    } else {
      (props as SingleSyncProps<Item> | SingleAsyncProps<Item>).onValueChange?.(undefined);
    }
  }, [isMultiple, props]);

  // 선택 여부 확인
  const isSelected = useCallback(
    (value: Value): boolean => {
      if (isMultiple) {
        return (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).value.includes(value);
      } else {
        return (props as SingleSyncProps<Item> | SingleAsyncProps<Item>).value === value;
      }
    },
    [isMultiple, props],
  );

  // async 상태
  const loading = isAsync && "loading" in props ? props.loading : false;
  const error = isAsync && "error" in props ? props.error : undefined;
  const hasValue = isMultiple
    ? (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).value.length > 0
    : !!(props as SingleSyncProps<Item> | SingleAsyncProps<Item>).value;

  // Badge 렌더링 헬퍼 (multi 모드 전용)
  const renderBadges = () => {
    if (!isMultiple) return null;

    const values = (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).value;

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
                className="ml-2 h-3 w-3 cursor-pointer"
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
                const value = (props as SingleSyncProps<Item> | SingleAsyncProps<Item>).value;
                return value ? (
                  <span className="flex-1 truncate text-left text-sm">{getItemLabel(value)}</span>
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
          <CommandList ref={commandListRef} onWheel={handleWheel}>
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
                          (props as MultiSyncProps<Item> | MultiAsyncProps<Item>).value.length ===
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
                        <span>{getItemLabel(option.value)}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
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

export const Select = React.forwardRef(function Select<Item>(
  props: SelectProps<Item>,
  ref: React.ForwardedRef<HTMLSelectElement>,
) {
  // 공통 상태/유틸
  const common = useSelectCommon(props, ref);

  // 모든 모드를 CommandBasedSelect로 통합
  const commandProps = props as (
    | SingleSyncProps<Item>
    | SingleAsyncProps<Item>
    | MultiSyncProps<Item>
    | MultiAsyncProps<Item>
  ) &
    SelectPropsBase<Item> &
    SelectPropsWithValueKey<Item>;

  return (
    <CommandBasedSelect
      props={commandProps}
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
}) as <Item>(
  props: SelectProps<Item> & React.RefAttributes<HTMLSelectElement>,
) => React.ReactElement;

export type { SelectProps, SelectItemDef, ExtractValue };
