"use client";

import * as React from "react";
import { useEffect } from "react";
import { type DateRange, DayPicker, type Matcher } from "react-day-picker";
import { useSonamuBaseContext } from "@/contexts";
import ChevronLeftIcon from "~icons/lucide/chevron-left";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import { cn } from "../../lib/utils";
import { buttonVariants } from "./button";
import { Select } from "./select/select";

const YEAR_RANGE = {
  START: 1900,
  END_OFFSET: 10,
} as const;

const RANGE_CALENDAR_COUNT = 2;

// 공통 아이콘 컴포넌트
const iconComponents = {
  IconLeft: ({ className, ...props }: { className?: string }) => (
    <ChevronLeftIcon className={cn("size-4", className)} {...props} />
  ),
  IconRight: ({ className, ...props }: { className?: string }) => (
    <ChevronRightIcon className={cn("size-4", className)} {...props} />
  ),
};

// 타입 정의
type CalendarMode = "single" | "range";

interface UseCalendarMonthsProps {
  mode?: CalendarMode;
  selected?: Matcher | Matcher[];
  month?: Date;
  onMonthChange?: (date: Date) => void;
}

interface CalendarCaptionProps {
  displayMonth: Date;
  onMonthChange: (date: Date) => void;
  isSecondCalendar?: boolean;
  baseMonth?: Date;
}

// 유틸리티 함수
function getNextMonth(date: Date): Date {
  const next = new Date(date);
  next.setMonth(date.getMonth() + 1);
  return next;
}

function generateYears(): number[] {
  const currentYear = new Date().getFullYear();
  const length = currentYear - YEAR_RANGE.START + YEAR_RANGE.END_OFFSET + 1;
  return Array.from({ length }, (_, i) => YEAR_RANGE.START + i);
}

// 캘린더 월 상태 관리 훅
function useCalendarMonths({
  mode,
  selected,
  month: controlledMonth,
  onMonthChange,
}: UseCalendarMonthsProps) {
  const isRangeMode = mode === "range";

  // 두 번째 캘린더의 월 상태만 관리 (첫 번째는 항상 부모가 관리)
  const [secondMonth, setSecondMonth] = React.useState<Date>(() => {
    if (!controlledMonth) {
      return new Date();
    }
    if (isRangeMode) {
      const rangeValue = selected as DateRange | undefined;
      if (rangeValue?.to) {
        return rangeValue.to;
      }
    }
    return getNextMonth(controlledMonth);
  });

  // selected 값 변경시 두 번째 캘린더 월 상태 업데이트
  useEffect(() => {
    if (!selected || !isRangeMode || !controlledMonth) return;

    const rangeValue = selected as DateRange | undefined;
    if (rangeValue?.to) {
      setSecondMonth(rangeValue.to);
    } else if (rangeValue?.from) {
      setSecondMonth(getNextMonth(rangeValue.from));
    }
  }, [selected, isRangeMode, controlledMonth]);

  // 월 변경 핸들러 생성
  const createMonthChangeHandler = React.useCallback(
    (index: number) => (date: Date) => {
      if (!onMonthChange) return;

      if (index === 0) {
        // 첫 번째 캘린더 변경
        const newBaseMonth = new Date(date);

        // 두 번째 캘린더가 첫 번째보다 이전이면 자동 조정
        if (secondMonth <= newBaseMonth) {
          setSecondMonth(getNextMonth(newBaseMonth));
        }

        onMonthChange(newBaseMonth);
      } else if (index === 1) {
        // 두 번째 캘린더 변경 (첫 번째보다 이후여야 함)
        const newSecondMonth = new Date(date);
        if (controlledMonth && newSecondMonth > controlledMonth) {
          setSecondMonth(newSecondMonth);
        }
      }
    },
    [controlledMonth, secondMonth, onMonthChange],
  );

  const getMonthForIndex = React.useCallback(
    (index: number): Date => {
      return index === 0 ? controlledMonth || new Date() : secondMonth;
    },
    [controlledMonth, secondMonth],
  );

  return {
    baseMonth: controlledMonth || new Date(),
    secondMonth,
    createMonthChangeHandler,
    getMonthForIndex,
  };
}

// Caption 컴포넌트
function CalendarCaption({
  displayMonth,
  onMonthChange,
  isSecondCalendar = false,
  baseMonth,
}: CalendarCaptionProps) {
  const { SD } = useSonamuBaseContext();
  const displayYear = displayMonth.getFullYear();
  const displayMonthIndex = displayMonth.getMonth();
  const years = React.useMemo(() => generateYears().reverse(), []);

  const monthNames = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, month) => SD(`rc.calendar.month.${month}`));
  }, [SD]);

  const handleMonthChange = React.useCallback(
    (value: number | undefined) => {
      if (value === undefined) return;
      const newDate = new Date(displayMonth);
      newDate.setMonth(value);
      onMonthChange(newDate);
    },
    [displayMonth, onMonthChange],
  );

  const handleYearChange = React.useCallback(
    (value: number | undefined) => {
      if (value === undefined) return;
      const newDate = new Date(displayMonth);
      newDate.setFullYear(value);
      onMonthChange(newDate);
    },
    [displayMonth, onMonthChange],
  );

  // 월 선택 아이템
  const monthItems = React.useMemo(() => {
    return monthNames.map((month, monthIndex) => {
      const isDisabled =
        isSecondCalendar &&
        baseMonth &&
        displayYear === baseMonth.getFullYear() &&
        monthIndex <= baseMonth.getMonth();

      return { value: monthIndex, label: month, disabled: isDisabled };
    });
  }, [monthNames, isSecondCalendar, baseMonth, displayYear]);

  // 연도 선택 아이템
  const yearItems = React.useMemo(() => {
    return years.map((year) => {
      const isDisabled = isSecondCalendar && baseMonth && year < baseMonth.getFullYear();
      return { value: year, label: String(year), disabled: isDisabled };
    });
  }, [years, isSecondCalendar, baseMonth]);

  return (
    <div className="flex justify-center pt-1 relative items-center w-full gap-2 px-10">
      <Select
        value={displayMonthIndex}
        onValueChange={handleMonthChange}
        items={monthItems}
        className="h-7 text-xs w-[110px]"
      />
      <Select
        value={displayYear}
        onValueChange={handleYearChange}
        items={yearItems}
        className="h-7 text-xs w-[90px]"
        contentClassName="max-h-[200px]"
      />
    </div>
  );
}

// 메인 컴포넌트
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const isRangeMode = props.mode === "range";

  const { baseMonth, createMonthChangeHandler, getMonthForIndex } = useCalendarMonths({
    mode: props.mode as CalendarMode,
    selected: props.selected,
    month: props.month,
    onMonthChange: props.onMonthChange,
  });

  // 공통 classNames 정의
  const sharedClassNames = React.useMemo(
    () => ({
      months: "flex flex-col sm:flex-row gap-2",
      month: "flex flex-col gap-4",
      caption: "flex justify-center pt-1 relative items-center w-full",
      caption_label: "text-sm font-medium hidden",
      nav: "flex items-center gap-1",
      nav_button: cn(
        buttonVariants({ variant: "outline" }),
        "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      ),
      nav_button_previous: "absolute left-1",
      nav_button_next: "absolute right-1",
      table: "w-full border-collapse mx-auto",
      head_row: "flex justify-center",
      head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
      row: "flex w-full mt-2 justify-center",
      cell: cn(
        "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md",
        isRangeMode
          ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
          : "[&:has([aria-selected])]:rounded-md",
      ),
      day: cn(
        buttonVariants({ variant: "ghost" }),
        "size-8 p-0 font-normal aria-selected:opacity-100",
      ),
      day_range_start:
        "day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground",
      day_range_end: "day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground",
      day_selected:
        "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
      day_today: "bg-accent text-accent-foreground",
      day_outside:
        "day-outside text-muted-foreground aria-selected:text-muted-foreground opacity-30",
      day_disabled: "text-muted-foreground opacity-50",
      day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
      day_hidden: "invisible",
      ...classNames,
    }),
    [isRangeMode, classNames],
  );

  // Caption 컴포넌트 생성 함수
  const createCaptionComponent = React.useCallback(
    (handleChange: (date: Date) => void, index: number) => {
      return ({ displayMonth }: { displayMonth: Date }) => (
        <CalendarCaption
          displayMonth={displayMonth}
          onMonthChange={handleChange}
          isSecondCalendar={index === 1}
          baseMonth={baseMonth}
        />
      );
    },
    [baseMonth],
  );

  // range 모드
  if (isRangeMode) {
    const { numberOfMonths: _numberOfMonths, mode, month, onMonthChange, ...restProps } = props;

    return (
      <div className={cn("flex gap-2", className)}>
        {Array.from({ length: RANGE_CALENDAR_COUNT }, (_, index) => (
          <DayPicker
            key={index}
            showOutsideDays={showOutsideDays}
            className="p-3"
            mode="range"
            month={getMonthForIndex(index)}
            onMonthChange={createMonthChangeHandler(index)}
            classNames={sharedClassNames}
            components={{
              ...iconComponents,
              Caption: createCaptionComponent(createMonthChangeHandler(index), index),
            }}
            {...restProps}
          />
        ))}
      </div>
    );
  }

  // single 모드
  const { month: _month, onMonthChange: _onMonthChange, ...restProps } = props;

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      month={baseMonth}
      onMonthChange={props.onMonthChange}
      classNames={sharedClassNames}
      components={{
        ...iconComponents,
        Caption: createCaptionComponent(props.onMonthChange || (() => {}), 0),
      }}
      {...restProps}
    />
  );
}

export { Calendar };
export type { DateRange };
