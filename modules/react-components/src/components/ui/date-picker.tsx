"use client";

import { format } from "date-fns";
import * as React from "react";
import { type DateRange } from "react-day-picker";
import CalendarIcon from "~icons/lucide/calendar";

import { useSonamuBaseContext } from "@/contexts";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// ============================================================================
// DatePicker — 단일 날짜 선택
// ============================================================================

interface DatePickerProps {
  value?: Date;
  onValueChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onValueChange,
  placeholder,
  disabled = false,
  className,
}: DatePickerProps) {
  const { SD } = useSonamuBaseContext();
  const finalPlaceholder = placeholder ?? SD("rc.datePicker.pickDate");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          data-empty={!value}
          className={cn(
            "w-full justify-start text-left font-normal",
            "data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon />
          {value ? format(value, "PPP") : <span>{finalPlaceholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onValueChange?.(date);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// DatePickerWithDropdown — 월/년 드롭다운 포함
// ============================================================================

export function DatePickerWithDropdown({
  value,
  onValueChange,
  placeholder,
  disabled = false,
  className,
}: DatePickerProps) {
  const { SD } = useSonamuBaseContext();
  const finalPlaceholder = placeholder ?? SD("rc.datePicker.selectDate");
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {value ? value.toLocaleDateString() : finalPlaceholder}
          <CalendarIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          captionLayout="dropdown"
          onSelect={(selectedDate) => {
            onValueChange?.(selectedDate);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// DatePickerWithRange — 날짜 범위 선택
// ============================================================================

interface DatePickerWithRangeProps {
  CalendarIcon: React.ComponentType<{ className?: string }>;
  value?: DateRange;
  onValueChange?: (value: DateRange | undefined) => void;
  placeholder?: string;
  dateFormat?: string;
  className?: string;
  numberOfMonths?: number;
  maxDate?: Date;
  minDate?: Date;
}

export function DatePickerWithRange({
  CalendarIcon: CalendarIconProp,
  value,
  onValueChange,
  placeholder = "Pick a date",
  dateFormat = "yyyy/MM/dd",
  className = "",
  numberOfMonths = 2,
  maxDate,
  minDate,
}: DatePickerWithRangeProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const displayText = React.useMemo(() => {
    if (!value?.from && !value?.to) {
      return placeholder;
    }
    const fromStr = value?.from ? format(value.from, dateFormat) : "";
    const toStr = value?.to ? format(value.to, dateFormat) : "";
    if (fromStr && toStr) {
      return `${fromStr} - ${toStr}`;
    }
    if (toStr) {
      return `- ${toStr}`;
    }
    return `${fromStr} -`;
  }, [value, dateFormat, placeholder]);

  const disabledMatcher = React.useMemo(() => {
    if (!maxDate && !minDate) {
      return undefined;
    }
    return (date: Date): boolean => {
      if (maxDate && date > maxDate) {
        return true;
      }
      if (minDate && date < minDate) {
        return true;
      }
      return false;
    };
  }, [maxDate, minDate]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`justify-start gap-2 h-8 px-3 text-xs font-normal ${className}`}
        >
          <CalendarIconProp className="h-4 w-4 shrink-0" />
          <span className="truncate">{displayText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={
            value?.from ??
            (value?.to ? new Date(value.to.getFullYear(), value.to.getMonth() - 1, 1) : undefined)
          }
          selected={value}
          onSelect={onValueChange}
          numberOfMonths={numberOfMonths}
          disabled={disabledMatcher}
        />
      </PopoverContent>
    </Popover>
  );
}

export type { DatePickerProps, DatePickerWithRangeProps, DateRange };
