"use client";

import * as React from "react";
import CheckIcon from "~icons/lucide/check";
import ChevronsUpDownIcon from "~icons/lucide/chevrons-up-down";
import XCircleIcon from "~icons/lucide/x-circle";

import { useSonamuBaseContext } from "@/contexts";

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

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  name?: string;
  value?: string;
  onValueChange?: (value: string | undefined) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
}

const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(
  (
    {
      options,
      name,
      value,
      onValueChange,
      onBlur,
      placeholder,
      searchPlaceholder,
      emptyText,
      disabled = false,
      className,
      clearable = false,
    },
    ref,
  ) => {
    const { SD } = useSonamuBaseContext();
    const [open, setOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // SD 기본값 설정
    const finalPlaceholder = placeholder ?? SD("rc.combobox.selectPlaceholder");
    const finalSearchPlaceholder = searchPlaceholder ?? SD("common.searchPlaceholder");
    const finalEmptyText = emptyText ?? SD("rc.combobox.noResults");

    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion -- useImperativeHandle은 ref가 할당된 후 실행되므로 안전함
    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleSelect = (currentValue: string) => {
      const newValue = currentValue === value ? "" : currentValue;
      onValueChange?.(newValue || undefined);
      setOpen(false);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onValueChange?.(undefined);
      setOpen(false);
    };

    const hasValue = Boolean(value);

    return (
      <>
        <input type="hidden" ref={inputRef} name={name} value={value || ""} onBlur={onBlur} />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className={cn("w-full justify-between", className)}
            >
              <span className="flex-1 truncate text-left">
                {value ? options.find((option) => option.value === value)?.label : finalPlaceholder}
              </span>
              <div className="flex items-center gap-1 shrink-0 pl-2">
                {clearable && hasValue && (
                  <span
                    className="flex items-center justify-center"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleClear}
                  >
                    <XCircleIcon className="h-4 w-4 cursor-pointer opacity-50 hover:opacity-100 transition-opacity" />
                  </span>
                )}
                <ChevronsUpDownIcon className="h-4 w-4 opacity-50" />
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder={finalSearchPlaceholder} className="h-9" />
              <CommandList>
                <CommandEmpty>{finalEmptyText}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem key={option.value} value={option.value} onSelect={handleSelect}>
                      {option.label}
                      <CheckIcon
                        className={cn(
                          "ml-auto",
                          value === option.value ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </>
    );
  },
);

Combobox.displayName = "Combobox";

export { Combobox };
