"use client";

import { format } from "date-fns";
import * as React from "react";
import { type DateRange } from "react-day-picker";

import { useSonamuBaseContext } from "@/contexts";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Select } from "./select/select";

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
  onValueChange?: (value: MonthPickerValue | undefined) => void;
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthPickerMultiple({
  CalendarIcon,
  ChevronDownIcon,
  value,
  onValueChange,
  placeholder,
  dateFormat = "MMM/yyyy",
  className = "",
  yearRange = { start: 2020, end: 2030 },
  defaultRangeMode = false,
}: MonthPickerMultipleProps) {
  const { SD } = useSonamuBaseContext();

  // Popover open state
  const [isOpen, setIsOpen] = React.useState(false);

  // Temp states (managed internally)
  const [tempIsRangeMode, setTempIsRangeMode] = React.useState(defaultRangeMode);
  const [tempDate, setTempDate] = React.useState<Date | undefined>();
  const [tempDateRange, setTempDateRange] = React.useState<DateRange | undefined>();
  const [tempYear, setTempYear] = React.useState(new Date().getFullYear());
  const [tempRangeStartYear, setTempRangeStartYear] = React.useState(new Date().getFullYear());
  const [tempRangeEndYear, setTempRangeEndYear] = React.useState(new Date().getFullYear());
  const [draftSource, setDraftSource] = React.useState(() => ({ value, defaultRangeMode }));

  const years = React.useMemo(
    () =>
      Array.from({ length: yearRange.end - yearRange.start + 1 }, (_, i) => yearRange.start + i),
    [yearRange.start, yearRange.end],
  );

  const resetDraft = (nextValue: MonthPickerValue | undefined, nextDefaultRangeMode: boolean) => {
    if (nextValue?.type === "range") {
      setTempIsRangeMode(true);
      setTempDateRange({ from: nextValue.from, to: nextValue.to });
      setTempDate(undefined);
      setTempRangeStartYear(nextValue.from.getFullYear());
      setTempRangeEndYear(nextValue.to.getFullYear());
    } else if (nextValue?.type === "single") {
      setTempIsRangeMode(false);
      setTempDate(nextValue.date);
      setTempDateRange(undefined);
      setTempYear(nextValue.date.getFullYear());
    } else {
      const currentYear = new Date().getFullYear();
      setTempIsRangeMode(nextDefaultRangeMode);
      setTempDate(undefined);
      setTempDateRange(undefined);
      setTempYear(currentYear);
      setTempRangeStartYear(currentYear);
      setTempRangeEndYear(currentYear);
    }
  };

  // 열린 편집기에서 외부 값이 바뀌면 기존 effect와 동일하게 임시 상태를 다시 맞춥니다.
  if (
    isOpen &&
    (draftSource.value !== value || draftSource.defaultRangeMode !== defaultRangeMode)
  ) {
    setDraftSource({ value, defaultRangeMode });
    resetDraft(value, defaultRangeMode);
  }

  // 팝오버를 열 때 확정된 값을 임시 편집 상태로 복사합니다.
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setDraftSource({ value, defaultRangeMode });
      resetDraft(value, defaultRangeMode);
    }
    setIsOpen(open);
  };

  const getDisplayDate = () => {
    if (!value) {
      return placeholder ?? `- ${format(new Date(), dateFormat)}`;
    }
    if (value.type === "single") {
      return format(value.date, dateFormat);
    }
    return `${format(value.from, dateFormat)} - ${format(value.to, dateFormat)}`;
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
    let newValue: MonthPickerValue | undefined;

    if (tempIsRangeMode && tempDateRange?.from && tempDateRange?.to) {
      newValue = {
        type: "range",
        from: tempDateRange.from,
        to: tempDateRange.to,
      };
    } else if (!tempIsRangeMode && tempDate) {
      newValue = { type: "single", date: tempDate };
    }

    onValueChange?.(newValue);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-4">
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={`gap-2 h-8 text-xs ${className}`}>
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
                {SD("rc.monthPickerMultiple.singleDate")}
              </Button>
              <Button
                variant={tempIsRangeMode ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange(true)}
                className="flex-1 h-7 text-xs"
              >
                {SD("rc.monthPickerMultiple.dateRange")}
              </Button>
            </div>
          </div>
          {tempIsRangeMode ? (
            <div className="flex">
              {/* Start Date */}
              <div className="p-4 space-y-2">
                <div className="text-xs text-muted-foreground">
                  {SD("rc.monthPickerMultiple.startDate")}
                </div>
                <Select
                  value={tempRangeStartYear}
                  onValueChange={(nextYear) => {
                    if (nextYear !== undefined) setTempRangeStartYear(nextYear);
                  }}
                  items={years.map((year) => ({
                    value: year,
                    label: String(year),
                    disabled: tempDateRange?.to ? year > tempDateRange.to.getFullYear() : false,
                  }))}
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((month, idx) => {
                    const isDisabled = tempDateRange?.to
                      ? tempRangeStartYear > tempDateRange.to.getFullYear() ||
                        (tempRangeStartYear === tempDateRange.to.getFullYear() &&
                          idx > tempDateRange.to.getMonth())
                      : false;
                    return (
                      <Button
                        key={month}
                        variant={
                          tempDateRange?.from?.getMonth() === idx &&
                          tempDateRange?.from?.getFullYear() === tempRangeStartYear
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          const newDate = new Date(tempRangeStartYear, idx, 1);
                          // 이미 선택된 시작 월을 다시 클릭하면 해제
                          if (
                            tempDateRange?.from?.getMonth() === idx &&
                            tempDateRange?.from?.getFullYear() === tempRangeStartYear
                          ) {
                            setTempDateRange({ from: undefined, to: tempDateRange?.to });
                          } else {
                            setTempDateRange({ from: newDate, to: tempDateRange?.to });
                          }
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
                <div className="text-xs text-muted-foreground">
                  {SD("rc.monthPickerMultiple.endDate")}
                </div>
                <Select
                  value={tempRangeEndYear}
                  onValueChange={(nextYear) => {
                    if (nextYear !== undefined) setTempRangeEndYear(nextYear);
                  }}
                  items={years.map((year) => ({
                    value: year,
                    label: String(year),
                    disabled: tempDateRange?.from ? year < tempDateRange.from.getFullYear() : false,
                  }))}
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((month, idx) => {
                    const isDisabled = tempDateRange?.from
                      ? tempRangeEndYear < tempDateRange.from.getFullYear() ||
                        (tempRangeEndYear === tempDateRange.from.getFullYear() &&
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
                          // 이미 선택된 종료 월을 다시 클릭하면 해제
                          if (
                            tempDateRange?.to?.getMonth() === idx &&
                            tempDateRange?.to?.getFullYear() === tempRangeEndYear
                          ) {
                            setTempDateRange({ from: tempDateRange?.from, to: undefined });
                          } else {
                            setTempDateRange({ from: tempDateRange?.from, to: newDate });
                          }
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
                value={tempYear}
                onValueChange={(nextYear) => {
                  if (nextYear !== undefined) setTempYear(nextYear);
                }}
                items={years.map((year) => ({ value: year, label: String(year) }))}
                className="h-8 text-xs"
              />
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((month, idx) => (
                  <Button
                    key={month}
                    variant={
                      tempDate?.getMonth() === idx && tempDate?.getFullYear() === tempYear
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      const newDate = new Date(tempYear, idx, 1);
                      // 이미 선택된 월을 다시 클릭하면 해제
                      if (tempDate?.getMonth() === idx && tempDate?.getFullYear() === tempYear) {
                        setTempDate(undefined);
                      } else {
                        setTempDate(newDate);
                      }
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
            <Button variant="outline" size="sm" onClick={handleCancel} className="h-8 text-xs">
              {SD("rc.common.cancel")}
            </Button>
            <Button variant="default" size="sm" onClick={handleSave} className="h-8 text-xs">
              {SD("rc.common.save")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
