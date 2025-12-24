"use client";

import * as React from "react";
import { format } from "date-fns";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import type { DateRange } from "react-day-picker";

/** 단일 월 또는 월 범위 값 */
export type MonthPickerValue =
  | { type: "single"; date: Date }
  | { type: "range"; from: Date; to: Date };

interface MonthPickerMultipleProps {
  /** Calendar icon component */
  CalendarIcon: React.ComponentType<{ className?: string }>;
  /** ChevronDown icon component */
  ChevronDownIcon: React.ComponentType<{ className?: string }>;
  /** Current value */
  value?: MonthPickerValue;
  /** Callback when value changes */
  onChange?: (
    event: null,
    data: { value: MonthPickerValue | undefined }
  ) => void;
  /** Placeholder text when no value */
  placeholder?: string;
  /** Date format string for display */
  dateFormat?: string;
  /** Custom className for trigger button */
  className?: string;
  /** Year range for selection */
  yearRange?: { start: number; end: number };
  /** Default to range mode when opening */
  defaultRangeMode?: boolean;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function MonthPickerMultiple({
  CalendarIcon,
  ChevronDownIcon,
  value,
  onChange,
  placeholder,
  dateFormat = "MMM/yyyy",
  className = "",
  yearRange = { start: 2020, end: 2030 },
  defaultRangeMode = false,
}: MonthPickerMultipleProps) {
  // Popover open state
  const [isOpen, setIsOpen] = React.useState(false);

  // Temp states (managed internally)
  const [tempIsRangeMode, setTempIsRangeMode] =
    React.useState(defaultRangeMode);
  const [tempDate, setTempDate] = React.useState<Date | undefined>();
  const [tempDateRange, setTempDateRange] = React.useState<
    DateRange | undefined
  >();
  const [tempYear, setTempYear] = React.useState<number>(
    new Date().getFullYear()
  );
  const [tempRangeStartYear, setTempRangeStartYear] = React.useState<number>(
    new Date().getFullYear()
  );
  const [tempRangeEndYear, setTempRangeEndYear] = React.useState<number>(
    new Date().getFullYear()
  );

  const years = React.useMemo(
    () =>
      Array.from(
        { length: yearRange.end - yearRange.start + 1 },
        (_, i) => yearRange.start + i
      ),
    [yearRange.start, yearRange.end]
  );

  // Initialize temp states when popover opens
  React.useEffect(() => {
    if (isOpen) {
      if (value?.type === "range") {
        setTempIsRangeMode(true);
        setTempDateRange({ from: value.from, to: value.to });
        setTempDate(undefined);
        setTempRangeStartYear(value.from.getFullYear());
        setTempRangeEndYear(value.to.getFullYear());
      } else if (value?.type === "single") {
        setTempIsRangeMode(false);
        setTempDate(value.date);
        setTempDateRange(undefined);
        setTempYear(value.date.getFullYear());
      } else {
        setTempIsRangeMode(defaultRangeMode);
        setTempDate(undefined);
        setTempDateRange(undefined);
        setTempYear(new Date().getFullYear());
        setTempRangeStartYear(new Date().getFullYear());
        setTempRangeEndYear(new Date().getFullYear());
      }
    }
  }, [isOpen, value, defaultRangeMode]);

  const getDisplayDate = () => {
    if (!value) {
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
    return tempDate !== undefined;
  };

  const handleModeChange = (isRangeMode: boolean) => {
    setTempIsRangeMode(isRangeMode);
    if (isRangeMode) {
      setTempDate(undefined);
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
      } else if (!tempIsRangeMode && tempDate) {
        onChange(null, { value: { type: "single", date: tempDate } });
      }
    }
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-4">
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
            <div className="flex">
              {/* Start Date */}
              <div className="p-4 space-y-2">
                <div className="text-xs text-muted-foreground">Start Date</div>
                <Select
                  value={tempRangeStartYear.toString()}
                  onChange={(e) =>
                    setTempRangeStartYear(parseInt(e.target.value))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => {
                      const isDisabled = tempDateRange?.to
                        ? year > tempDateRange.to.getFullYear()
                        : false;
                      return (
                        <SelectItem
                          key={year}
                          value={year.toString()}
                          disabled={isDisabled}
                        >
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((month, idx) => {
                    const isDisabled = tempDateRange?.to
                      ? tempRangeStartYear > tempDateRange.to.getFullYear() ||
                        (tempRangeStartYear ===
                          tempDateRange.to.getFullYear() &&
                          idx > tempDateRange.to.getMonth())
                      : false;
                    return (
                      <Button
                        key={month}
                        variant={
                          tempDateRange?.from?.getMonth() === idx &&
                          tempDateRange?.from?.getFullYear() ===
                            tempRangeStartYear
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          const newDate = new Date(tempRangeStartYear, idx, 1);
                          setTempDateRange({
                            from: newDate,
                            to: tempDateRange?.to,
                          });
                        }}
                        disabled={isDisabled}
                        className="h-8 text-xs"
                      >
                        {month}
                      </Button>
                    );
                  })}
                </div>
              </div>
              {/* Divider */}
              <div className="border-r" />
              {/* End Date */}
              <div className="p-4 space-y-2">
                <div className="text-xs text-muted-foreground">End Date</div>
                <Select
                  value={tempRangeEndYear.toString()}
                  onChange={(e) =>
                    setTempRangeEndYear(parseInt(e.target.value))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => {
                      const isDisabled = tempDateRange?.from
                        ? year < tempDateRange.from.getFullYear()
                        : false;
                      return (
                        <SelectItem
                          key={year}
                          value={year.toString()}
                          disabled={isDisabled}
                        >
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((month, idx) => {
                    const isDisabled = tempDateRange?.from
                      ? tempRangeEndYear < tempDateRange.from.getFullYear() ||
                        (tempRangeEndYear ===
                          tempDateRange.from.getFullYear() &&
                          idx < tempDateRange.from.getMonth())
                      : false;
                    return (
                      <Button
                        key={month}
                        variant={
                          tempDateRange?.to?.getMonth() === idx &&
                          tempDateRange?.to?.getFullYear() === tempRangeEndYear
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          const newDate = new Date(tempRangeEndYear, idx, 1);
                          setTempDateRange({
                            from: tempDateRange?.from,
                            to: newDate,
                          });
                        }}
                        disabled={isDisabled}
                        className="h-8 text-xs"
                      >
                        {month}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              <Select
                value={tempYear.toString()}
                onChange={(e) => setTempYear(parseInt(e.target.value))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((month, idx) => (
                  <Button
                    key={month}
                    variant={
                      tempDate?.getMonth() === idx &&
                      tempDate?.getFullYear() === tempYear
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      const newDate = new Date(tempYear, idx, 1);
                      setTempDate(newDate);
                    }}
                    className="h-8 text-xs"
                  >
                    {month}
                  </Button>
                ))}
              </div>
            </div>
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
