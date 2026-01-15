"use client";

import * as React from "react";
import { useSonamuContext } from "@/contexts";
import CheckIcon from "~icons/lucide/check";
import ChevronsUpDownIcon from "~icons/lucide/chevrons-up-down";
import Loader2Icon from "~icons/lucide/loader2";
import XCircleIcon from "~icons/lucide/x-circle";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface AsyncSelectOption<T = unknown> {
  value: T;
  label: string;
}

export interface AsyncSelectProps<T = number> {
  /** 선택 옵션 배열 */
  options: AsyncSelectOption<T>[];
  /** 현재 선택된 값 */
  value?: T | null;
  /** 값 변경 핸들러 */
  onValueChange?: (value: T | undefined) => void;
  /** 로딩 상태 */
  isLoading?: boolean;
  /** placeholder 텍스트 */
  placeholder?: string;
  /** 검색 입력 placeholder */
  searchPlaceholder?: string;
  /** 결과 없음 텍스트 */
  emptyText?: string;
  /** 로딩 중 텍스트 */
  loadingText?: string;
  /** clearable 옵션 */
  clearable?: boolean;
  /** 비활성화 */
  disabled?: boolean;
  /** 추가 className */
  className?: string;
  /** 검색어 변경 핸들러 (서버 검색용) */
  onSearch?: (keyword: string) => void;
  /** 검색 디바운스 시간 (ms) */
  searchDebounce?: number;
}

export function AsyncSelect<T = number>({
  options,
  value,
  onValueChange,
  isLoading = false,
  placeholder,
  searchPlaceholder,
  emptyText,
  loadingText,
  clearable = false,
  disabled = false,
  className,
  onSearch,
  searchDebounce = 300,
}: AsyncSelectProps<T>) {
  const { SD } = useSonamuContext();
  const [open, setOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");

  // SD 기본값 설정
  const finalPlaceholder = placeholder ?? SD("component.asyncSelect.selectPlaceholder");
  const finalSearchPlaceholder = searchPlaceholder ?? SD("common.searchPlaceholder");
  const finalEmptyText = emptyText ?? SD("component.asyncSelect.noResults");
  const finalLoadingText = loadingText ?? SD("component.asyncSelect.loading");

  // 검색어 디바운스
  React.useEffect(() => {
    if (!onSearch) return;

    const timer = setTimeout(() => {
      onSearch(keyword);
    }, searchDebounce);

    return () => clearTimeout(timer);
  }, [keyword, onSearch, searchDebounce]);

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const handleSelect = (selectedValue: T | undefined) => {
    onValueChange?.(selectedValue);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onValueChange?.(undefined);
    setOpen(false);
  };

  // value가 실제로 유효한 값인지 확인 (null, undefined, 빈 문자열 제외)
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn(
            "w-full justify-between hover:bg-background! hover:text-foreground! dark:hover:bg-input/30!",
            className,
          )}
        >
          <span className="flex-1 truncate text-left">
            {isLoading ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : selectedOption ? (
              selectedOption.label
            ) : (
              <span className="text-muted-foreground">{finalPlaceholder}</span>
            )}
          </span>
          <div className="flex items-center gap-1 shrink-0 pl-2">
            {clearable && hasValue && (
              <span
                className="flex items-center justify-center cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={handleClear}
              >
                <XCircleIcon className="h-4 w-4 opacity-50 hover:opacity-100 transition-opacity" />
              </span>
            )}
            <ChevronsUpDownIcon className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={finalSearchPlaceholder}
            value={keyword}
            onValueChange={setKeyword}
          />
          <CommandList>
            <CommandEmpty>{isLoading ? finalLoadingText : finalEmptyText}</CommandEmpty>
            <CommandGroup>
              {clearable && (
                <CommandItem
                  value="__all__"
                  onSelect={() => handleSelect(undefined)}
                  className="cursor-pointer hover:bg-accent"
                >
                  <CheckIcon
                    className={cn("mr-2 h-4 w-4", !hasValue ? "opacity-100" : "opacity-0")}
                  />
                  {SD("common.all")}
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={String(option.value)}
                  value={String(option.value)}
                  onSelect={() => handleSelect(option.value)}
                  className="cursor-pointer"
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

AsyncSelect.displayName = "AsyncSelect";
