"use client";

import { format } from "date-fns";
import * as React from "react";
import CalendarIcon from "~icons/lucide/calendar";

import { useSonamuBaseContext } from "@/contexts";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface DatePickerProps {
  value?: Date;
  onValueChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Date Picker Component
 *
 * Based on shadcn/ui Date Picker pattern:
 * @see https://ui.shadcn.com/docs/components/date-picker
 *
 * Example usage:
 * ```tsx
 * const [date, setDate] = useState<Date>()
 * <DatePicker value={date} onValueChange={(date) => setDate(date)} />
 * ```
 */
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

/**
 * Date Picker with Dropdown Layout
 * Useful for selecting dates of birth or past dates
 */
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
