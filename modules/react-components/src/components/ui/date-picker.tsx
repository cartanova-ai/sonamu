"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

interface DatePickerProps {
  value?: Date
  onChange?: (event: null, data: { value: Date | undefined }) => void
  placeholder?: string
  disabled?: boolean
  className?: string
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
 * <DatePicker value={date} onChange={(e, { value }) => setDate(value)} />
 * ```
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
  className,
}: DatePickerProps) {
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
            className
          )}
        >
          <CalendarIcon />
          {value ? format(value, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            if (onChange) {
              onChange(null, { value: date })
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Date Picker with Dropdown Layout
 * Useful for selecting dates of birth or past dates
 */
export function DatePickerWithDropdown({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {value ? value.toLocaleDateString() : placeholder}
          <CalendarIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          captionLayout="dropdown"
          onSelect={(selectedDate) => {
            if (onChange) {
              onChange(null, { value: selectedDate })
            }
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

