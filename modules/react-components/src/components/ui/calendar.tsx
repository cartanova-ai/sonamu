"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";

import { cn } from "../../lib/utils";
import { buttonVariants } from "./button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const getInitialMonth = () => {
    if (props.mode === "range") {
      const rangeValue = props.selected as DateRange | undefined;
      return rangeValue?.from || new Date();
    }
    return (props.selected as Date | undefined) || new Date();
  };

  const getInitialSecondMonth = () => {
    const firstMonth = getInitialMonth();
    const secondMonth = new Date(firstMonth);
    secondMonth.setMonth(secondMonth.getMonth() + 1);
    return secondMonth;
  };

  const [firstMonth, setFirstMonth] = React.useState<Date>(getInitialMonth());
  const [secondMonth, setSecondMonth] = React.useState<Date>(getInitialSecondMonth());

  React.useEffect(() => {
    if (props.selected) {
      if (props.mode === "range") {
        const rangeValue = props.selected as DateRange | undefined;
        if (rangeValue?.from) {
          setFirstMonth(rangeValue.from);
          const newSecondMonth = new Date(rangeValue.from);
          newSecondMonth.setMonth(newSecondMonth.getMonth() + 1);
          setSecondMonth(newSecondMonth);
        }
      } else {
        const dateValue = props.selected as Date | undefined;
        if (dateValue) {
          setFirstMonth(dateValue);
        }
      }
    }
  }, [props.selected, props.mode]);

  // Generate years from 1900 to current year + 10
  const years = Array.from({ length: new Date().getFullYear() - 1900 + 11 }, (_, i) => 1900 + i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const isRangeMode = props.mode === "range" && props.numberOfMonths === 2;

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      month={firstMonth}
      onMonthChange={setFirstMonth}
      classNames={{
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
        head_cell:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        row: "flex w-full mt-2 justify-center",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md",
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 font-normal aria-selected:opacity-100",
        ),
        day_range_start:
          "day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_range_end:
          "day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("size-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("size-4", className)} {...props} />
        ),
        Caption: ({ displayMonth, displayIndex }) => {
          // Determine which month state to use based on displayIndex
          const currentDisplayMonth = isRangeMode && displayIndex === 1 ? secondMonth : displayMonth;
          const displayYear = currentDisplayMonth.getFullYear();
          const displayMonthIndex = currentDisplayMonth.getMonth();

          const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
            const newDate = new Date(currentDisplayMonth);
            newDate.setMonth(parseInt(e.target.value));
            
            if (isRangeMode && displayIndex === 1) {
              setSecondMonth(newDate);
            } else {
              setFirstMonth(newDate);
            }
          };

          const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
            const newDate = new Date(currentDisplayMonth);
            newDate.setFullYear(parseInt(e.target.value));
            
            if (isRangeMode && displayIndex === 1) {
              setSecondMonth(newDate);
            } else {
              setFirstMonth(newDate);
            }
          };

          return (
            <div className="flex justify-center pt-1 relative items-center w-full gap-2 px-10">
              <Select value={displayMonthIndex.toString()} onChange={handleMonthChange}>
                <SelectTrigger className="h-7 text-xs w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={month} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={displayYear.toString()} onChange={handleYearChange}>
                <SelectTrigger className="h-7 text-xs w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {years.reverse().map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
export type { DateRange };
