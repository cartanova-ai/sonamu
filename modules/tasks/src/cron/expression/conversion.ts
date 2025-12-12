function convertAsterisk(expression: string, replecement: string): string {
  if (expression.indexOf("*") !== -1) {
    return expression.replace("*", replecement);
  }
  return expression;
}

export function convertAsterisksToRanges(expressions: string[]): string[] {
  expressions[0] = convertAsterisk(expressions[0], "0-59");
  expressions[1] = convertAsterisk(expressions[1], "0-59");
  expressions[2] = convertAsterisk(expressions[2], "0-23");
  expressions[3] = convertAsterisk(expressions[3], "1-31");
  expressions[4] = convertAsterisk(expressions[4], "1-12");
  expressions[5] = convertAsterisk(expressions[5], "0-6");
  return expressions;
}

export function convertMonthName(expression: string) {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ] as const;
  const shortMonths = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ] as const;

  for (let i = 0; i < months.length; i++) {
    expression = expression.replace(new RegExp(months[i], "gi"), String(i + 1));
    expression = expression.replace(new RegExp(shortMonths[i], "gi"), String(i + 1));
  }

  return expression;
}

function replaceWithRange(
  expression: string,
  text: string,
  init: string,
  end: string,
  stepTxt: string,
): string {
  const step = parseInt(stepTxt);
  const numbers: number[] = [];
  let last = parseInt(end);
  let first = parseInt(init);

  if (first > last) {
    last = parseInt(init);
    first = parseInt(end);
  }

  for (let i = first; i <= last; i += step) {
    numbers.push(i);
  }

  return expression.replace(new RegExp(text, "i"), numbers.join());
}

export function convertAllRanges(expressions: string[]): string[] {
  return expressions.map((expression) => {
    const rangeRegEx = /(\d+)-(\d+)(\/(\d+)|)/;
    let match = rangeRegEx.exec(expression);
    while (match !== null && match.length > 0) {
      expression = replaceWithRange(expression, match[0], match[1], match[2], match[4] || "1");
      match = rangeRegEx.exec(expression);
    }

    return expression;
  });
}

export function convertWeekDays(expression: string) {
  const weekDays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const shortWeekDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

  expression = expression.replace("7", "0");
  for (let i = 0; i < weekDays.length; i++) {
    expression = expression.replace(new RegExp(weekDays[i], "gi"), String(i));
    expression = expression.replace(new RegExp(shortWeekDays[i], "gi"), String(i));
  }

  return expression;
}

function appendSeccondExpression(expressions: string[]) {
  if (expressions.length === 5) {
    return ["0"].concat(expressions);
  }
  return expressions;
}

function removeSpaces(str: string) {
  return str.replace(/\s{2,}/g, " ").trim();
}

// Function that takes care of normalization.
function normalizeIntegers(expressions: string[]): number[][] {
  return expressions.map((expression) => {
    return expression.split(",").map((number) => Number.parseInt(number, 10));
  });
}

/*
 * The node-cron core allows only numbers (including multiple numbers e.g 1,2).
 * This module is going to translate the month names, week day names and ranges
 * to integers relatives.
 *
 * Month names example:
 *  - expression 0 1 1 January,Sep *
 *  - Will be translated to 0 1 1 1,9 *
 *
 * Week day names example:
 *  - expression 0 1 1 2 Monday,Sat
 *  - Will be translated to 0 1 1 1,5 *
 *
 * Ranges example:
 *  - expression 1-5 * * * *
 *  - Will be translated to 1,2,3,4,5 * * * *
 */
export function interprete(expression: string) {
  let expressions = removeSpaces(`${expression}`).split(" ");
  expressions = appendSeccondExpression(expressions);
  expressions[4] = convertMonthName(expressions[4]);
  expressions[5] = convertWeekDays(expressions[5]);
  expressions = convertAsterisksToRanges(expressions);
  expressions = convertAllRanges(expressions);
  return normalizeIntegers(expressions);
}

export default interprete;
