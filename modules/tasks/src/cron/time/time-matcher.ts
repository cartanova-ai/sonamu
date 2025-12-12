import convertExpression, { convertWeekDays } from "../expression/conversion";
import { LocalizedTime } from "./localized-time";

function matchValue(allowedValues: number[], value: number) {
  return allowedValues.indexOf(value) !== -1;
}

function availableValue(values: number[], currentValue: number): number | false {
  const availableValues = values.sort((a, b) => a - b).filter((s) => s > currentValue);
  if (availableValues.length > 0) return availableValues[0];
  return false;
}

function verifyLocalDate(
  expressions: number[][],
  localizedTime: LocalizedTime,
  ignoreWeekday: boolean = false,
) {
  const parts = localizedTime.getParts();
  const entries: [number[], number][] = [
    [expressions[0], parts.second],
    [expressions[1], parts.minute],
    [expressions[2], parts.hour],
    [expressions[3], parts.day],
    [expressions[4], parts.month],
  ];

  if (!ignoreWeekday) {
    entries.push([expressions[5], Number.parseInt(convertWeekDays(parts.weekday), 10)]);
  }

  return entries.every(([expression, value]) => matchValue(expression, value));
}

export class TimeMatcher {
  constructor(
    public readonly originExpression: string,
    public readonly timezone?: string,
    public readonly expressions: number[][] = convertExpression(originExpression),
  ) {}

  match(date: Date) {
    return verifyLocalDate(this.expressions, new LocalizedTime(date, this.timezone));
  }

  getNextMatch(date: Date) {
    return new InternalMatcher(this.originExpression, date, this.timezone).matchNext().toDate();
  }
}

export class InternalMatcher {
  constructor(
    public readonly origin: string,
    public readonly baseDate: Date,
    public readonly timezone?: string,
    public readonly parsed: number[][] = convertExpression(origin),
  ) {}

  isMatching() {
    return verifyLocalDate(this.parsed, new LocalizedTime(this.baseDate, this.timezone));
  }

  matchNext() {
    const findNextDateIgnoringWeekday = () => {
      const baseDate = new Date(this.baseDate.getTime());
      baseDate.setMilliseconds(0);
      const localTime = new LocalizedTime(baseDate, this.timezone);
      const dateParts = localTime.getParts();
      const date = new LocalizedTime(localTime.toDate(), this.timezone);
      const seconds = this.parsed[0];
      const nextSecond = availableValue(seconds, dateParts.second);
      if (nextSecond) {
        date.set("second", nextSecond);
        if (verifyLocalDate(this.parsed, date, true)) {
          return date;
        }
      }
      date.set("second", seconds[0]);

      const minutes = this.parsed[1];
      const nextMinute = availableValue(minutes, dateParts.minute);
      if (nextMinute) {
        date.set("minute", nextMinute);
        if (verifyLocalDate(this.parsed, date, true)) {
          return date;
        }
      }
      date.set("minute", minutes[0]);

      const hours = this.parsed[2];
      const nextHour = availableValue(hours, dateParts.hour);
      if (nextHour) {
        date.set("hour", nextHour);
        if (verifyLocalDate(this.parsed, date, true)) {
          return date;
        }
      }
      date.set("hour", hours[0]);

      const days = this.parsed[3];
      const nextDay = availableValue(days, dateParts.day);
      if (nextDay) {
        date.set("day", nextDay);
        if (verifyLocalDate(this.parsed, date, true)) {
          return date;
        }
      }

      date.set("day", days[0]);

      const months = this.parsed[4];
      const nextMonth = availableValue(months, dateParts.month);

      if (nextMonth) {
        date.set("month", nextMonth);
        if (verifyLocalDate(this.parsed, date, true)) {
          return date;
        }
      }

      date.set("year", date.getParts().year + 1);
      date.set("month", months[0]);

      return date;
    };

    const date = findNextDateIgnoringWeekday();
    const weekdays = this.parsed[5];
    const days = this.parsed[3];

    // Check if day-of-month is wildcard (contains all possible days 1-31)
    const isDayWildcard = Array.from({ length: 31 }, (_, i) => i + 1).every((day) =>
      days.includes(day),
    );

    if (isDayWildcard) {
      // When day is wildcard, use OR logic: find next occurrence of weekday OR month
      // Since we already found the right month, just find the next weekday in that month
      let currentWeekday = Number.parseInt(convertWeekDays(date.getParts().weekday), 10);

      while (!(weekdays.indexOf(currentWeekday) > -1)) {
        date.set("day", date.getParts().day + 1);
        currentWeekday = Number.parseInt(convertWeekDays(date.getParts().weekday), 10);
      }
    } else {
      // When day is specific, use AND logic: must match exact day AND weekday
      // Keep searching until we find a date where the specified day falls on the specified weekday
      const maxAttempts = 10 * 12; // 10 years * 12 months
      let attempts = 0;

      while (attempts < maxAttempts) {
        const currentWeekday = Number.parseInt(convertWeekDays(date.getParts().weekday), 10);

        if (weekdays.indexOf(currentWeekday) > -1) {
          // Found matching weekday for the specified day
          break;
        }

        // Move to next occurrence of the same day in the same month (next year if necessary)
        const currentParts = date.getParts();
        const nextMonth = availableValue(this.parsed[4], currentParts.month);

        if (nextMonth) {
          date.set("month", nextMonth);
        } else {
          // Move to next year and reset to first allowed month
          date.set("year", currentParts.year + 1);
          date.set("month", this.parsed[4][0]);
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error("Could not find next matching date within reasonable time range");
      }
    }

    return date;
  }
}
