import { describe, expect, it } from "vitest";
import {
  convertAllRanges,
  convertAsterisksToRanges,
  convertMonthName,
  convertWeekDays,
  interprete,
} from "./conversion";

describe("convertWeekDays", () => {
  it("should convert week day names names", () => {
    const weekDays = convertWeekDays("Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday");
    expect(weekDays).to.equal("1,2,3,4,5,6,0");
  });

  it("should convert short week day names names", () => {
    const weekDays = convertWeekDays("Mon,Tue,Wed,Thu,Fri,Sat,Sun");
    expect(weekDays).to.equal("1,2,3,4,5,6,0");
  });

  it("should convert 7 to 0", () => {
    const weekDays = convertWeekDays("7");
    expect(weekDays).to.equal("0");
  });
});

describe("convertAllRanges", () => {
  it("should convert ranges to numbers", () => {
    const expressions = "0-3 0-3 8-10 1-3 1-2 0-3".split(" ");
    const expression = convertAllRanges(expressions).join(" ");
    expect(expression).to.equal("0,1,2,3 0,1,2,3 8,9,10 1,2,3 1,2 0,1,2,3");
  });

  it("should convert comma delimited ranges to numbers", () => {
    const expressions = "0-2,10-23".split(" ");
    const expression = convertAllRanges(expressions).join(" ");
    expect(expression).to.equal("0,1,2,10,11,12,13,14,15,16,17,18,19,20,21,22,23");
  });

  it("should convert comma delimited ranges to numbers with step", () => {
    const expressions = "0-10/2 11-21/2".split(" ");
    const expression = convertAllRanges(expressions).join(" ");
    expect(expression).to.equal("0,2,4,6,8,10 11,13,15,17,19,21");
  });
});

describe("convertMonthName", () => {
  it("should convert month full names", () => {
    const months = convertMonthName(
      "January,February,March,April,May,June,July,August,September,October,November,December",
    );
    expect(months).to.equal("1,2,3,4,5,6,7,8,9,10,11,12");
  });

  it("should convert month names", () => {
    const months = convertMonthName("Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec");
    expect(months).to.equal("1,2,3,4,5,6,7,8,9,10,11,12");
  });
});

describe("convertAsterisksToRanges", () => {
  it("should convert * to ranges", () => {
    const expressions = "* * * * * *".split(" ");
    const expression = convertAsterisksToRanges(expressions).join(" ");
    expect(expression).to.equal("0-59 0-59 0-23 1-31 1-12 0-6");
  });

  it("should convert * to ranges with step", () => {
    const expressions = "*/2 * * * * *".split(" ");
    const expression = convertAsterisksToRanges(expressions).join(" ");
    expect(expression).to.equal("0-59/2 0-59 0-23 1-31 1-12 0-6");
  });
});

describe("interprete", () => {
  it("should convert month names", () => {
    const expressions = interprete("* * * * January,February *");
    expect(expressions[4]).to.deep.equal([1, 2]);
  });

  it("should convert week day names", () => {
    const expressions = interprete("* * * * * Mon,Sun");
    expect(expressions[5]).to.deep.equal([1, 0]);
  });
});
