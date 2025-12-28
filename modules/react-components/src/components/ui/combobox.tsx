"use client";

import * as React from "react";
import CheckIcon from "~icons/lucide/check";
import ChevronsUpDownIcon from "~icons/lucide/chevrons-up-down";
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

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  name?: string;
  value?: string;
  onChange?: (e: unknown, data: { value: string | undefined }) => void;
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
      onChange,
      onBlur,
      placeholder = "Select option...",
      searchPlaceholder = "Search...",
      emptyText = "No option found.",
      disabled = false,
      className,
      clearable = false,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // biome-ignore lint/style/noNonNullAssertion: useImperativeHandle은 ref가 할당된 후 실행되므로 안전함
    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleSelect = (currentValue: string) => {
      const newValue = currentValue === value ? "" : currentValue;

      if (inputRef.current) {
        inputRef.current.value = newValue;

        const nativeEvent = new Event("change", { bubbles: true });
        Object.defineProperty(nativeEvent, "target", {
          writable: false,
          value: inputRef.current,
        });
        inputRef.current.dispatchEvent(nativeEvent);
      }
      setOpen(false);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (onChange) {
        // useListParams/useTypeForm의 register는 (e, { value }) 형태를 기대함
        onChange(null, { value: undefined });
      }
      setOpen(false);
    };

    const hasValue = Boolean(value);

    return (
      <>
        <input
          type="hidden"
          ref={inputRef}
          name={name}
          value={value || ""}
          onChange={(e) => onChange?.(e, { value: e.target.value })}
          onBlur={onBlur}
        />
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
                {value ? options.find((option) => option.value === value)?.label : placeholder}
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
              <CommandInput placeholder={searchPlaceholder} className="h-9" />
              <CommandList>
                <CommandEmpty>{emptyText}</CommandEmpty>
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
