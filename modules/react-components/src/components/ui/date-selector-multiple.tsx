"use client";

import * as React from "react";
import { format } from "date-fns";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Calendar } from "./calendar";
import type { DateRange } from "react-day-picker";

/** 단일 날짜 또는 날짜 범위 값 */
export type DateSelectorValue =
  | { type: "single"; date: Date }
  | { type: "range"; from: Date; to: Date };

interface DateSelectorMultipleProps {
  /** Calendar icon component */
  CalendarIcon: React.ComponentType<{ className?: string }>;
  /** ChevronDown icon component */
  ChevronDownIcon: React.ComponentType<{ className?: string }>;
  /** Current value */
  value?: DateSelectorValue;
  /** Callback when value changes */
  onChange?: (
    event: null,
    data: { value: DateSelectorValue | undefined }
  ) => void;
  /** Placeholder text when no value */
  placeholder?: string;
  /** Date format string for display */
  dateFormat?: string;
  /** Custom className for trigger button */
  className?: string;
  /** Number of months to display in range mode */
  numberOfMonths?: number;
  /** Default to range mode when opening */
  defaultRangeMode?: boolean;
}

export function DateSelectorMultiple({
  CalendarIcon,
  ChevronDownIcon,
  value,
  onChange,
  placeholder,
  dateFormat = "yyyy/MM/dd",
  className = "",
  numberOfMonths = 2,
  defaultRangeMode = false,
}: DateSelectorMultipleProps) {
  // Popover open state
  const [isOpen, setIsOpen] = React.useState(false);

  // Temp states (managed internally)
  const [tempIsRangeMode, setTempIsRangeMode] =
    React.useState(defaultRangeMode);
  const [tempSingleDate, setTempSingleDate] = React.useState<
    Date | undefined
  >();
  const [tempDateRange, setTempDateRange] = React.useState<
    DateRange | undefined
  >();
  const [currentMonth, setCurrentMonth] = React.useState<Date>(new Date());

  // Initialize temp states when popover opens
  React.useEffect(() => {
    if (isOpen) {
      if (value?.type === "range") {
        setTempIsRangeMode(true);
        setTempDateRange({ from: value.from, to: value.to });
        setTempSingleDate(undefined);
        setCurrentMonth(value.from);
      } else if (value?.type === "single") {
        setTempIsRangeMode(false);
        setTempSingleDate(value.date);
        setTempDateRange(undefined);
        setCurrentMonth(value.date);
      } else {
        setTempIsRangeMode(defaultRangeMode);
        setTempSingleDate(undefined);
        setTempDateRange(undefined);
        setCurrentMonth(new Date());
      }
    }
  }, [isOpen, value, defaultRangeMode]);

  const getDisplayDate = () => {
    if (!value) {
      // 날짜선택이 안된 경우
      return placeholder ?? `- ${format(new Date(), dateFormat)}`;
    }
    if (value.type === "single") {
      return format(value.date, dateFormat);
    }
    return `${format(value.from, dateFormat)} - ${format(
      value.to,
      dateFormat
    )}`;
  };

  const isSaveEnabled = () => {
    if (tempIsRangeMode) {
      return !!(tempDateRange?.from && tempDateRange?.to);
    }
    return tempSingleDate !== undefined;
  };

  const handleModeChange = (isRangeMode: boolean) => {
    setTempIsRangeMode(isRangeMode);
    if (isRangeMode) {
      setTempSingleDate(undefined);
    } else {
      setTempDateRange(undefined);
    }
  };

  const handleSave = () => {
    if (onChange) {
      if (tempIsRangeMode && tempDateRange?.from && tempDateRange?.to) {
        onChange(null, {
          value: {
            type: "range",
            from: tempDateRange.from,
            to: tempDateRange.to,
          },
        });
      } else if (!tempIsRangeMode && tempSingleDate) {
        onChange(null, { value: { type: "single", date: tempSingleDate } });
      }
    }
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <div className="flex items-center justify-between">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`gap-2 h-8 text-xs ${className}`}
          >
            <CalendarIcon className="h-4 w-4" />
            {getDisplayDate()}
            <ChevronDownIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 border-b space-y-2">
            <div className="flex gap-2">
              <Button
                variant={!tempIsRangeMode ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange(false)}
                className="flex-1 h-7 text-xs"
              >
                Single Date
              </Button>
              <Button
                variant={tempIsRangeMode ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange(true)}
                className="flex-1 h-7 text-xs"
              >
                Date Range
              </Button>
            </div>
          </div>
          {tempIsRangeMode ? (
            <Calendar
              mode="range"
              selected={tempDateRange}
              onSelect={setTempDateRange}
              numberOfMonths={numberOfMonths}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              disabled={(date) => {
                if (!tempDateRange?.from || tempDateRange?.to) return false;
                return date < tempDateRange.from;
              }}
            />
          ) : (
            <Calendar
              mode="single"
              selected={tempSingleDate}
              onSelect={setTempSingleDate}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
            />
          )}
          <div className="p-3 border-t flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={!isSaveEnabled()}
              className="h-8 text-xs"
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
