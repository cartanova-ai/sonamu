import { assert, describe, it } from "vitest";
import { InternalMatcher, TimeMatcher } from "./time-matcher";

describe("InternalMatcher", () => {
  it("get next second", () => {
    const baseDate = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));
    const matcher = new InternalMatcher("* * * * * *", baseDate, "Etc/UTC");

    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2025-01-01T00:00:01.000Z");
  });

  it("match on next next minute", () => {
    const baseDate = new Date(Date.UTC(2025, 0, 1, 0, 0, 11));
    const matcher = new InternalMatcher("10 * * * * *", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2025-01-01T00:01:10.000Z");
  });

  it("match on next hour", () => {
    const baseDate = new Date(Date.UTC(2025, 0, 1, 0, 11, 0));
    const matcher = new InternalMatcher("0 10 * * * *", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2025-01-01T01:10:00.000Z");
  });

  it("match on next day", () => {
    const baseDate = new Date(Date.UTC(2025, 0, 1, 11, 0, 0));
    const matcher = new InternalMatcher("0 0 10 * * *", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2025-01-02T10:00:00.000Z");
  });

  it("match on next month", () => {
    const baseDate = new Date(Date.UTC(2025, 0, 11, 0, 0, 0));
    const matcher = new InternalMatcher("0 0 0 10 * *", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2025-02-10T00:00:00.000Z");
  });

  it("match on next on year", () => {
    const baseDate = new Date(Date.UTC(2025, 10, 1, 0, 0, 0));
    const matcher = new InternalMatcher("0 0 0 1 10 *", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2026-10-01T00:00:00.000Z");
  });

  it("match on next weekday", () => {
    const baseDate = new Date(Date.UTC(2025, 4, 2, 0, 0, 0));
    const matcher = new InternalMatcher("0 0 0 2 may wednesday", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2029-05-02T00:00:00.000Z");
  });

  it("should match next Sunday at 03:43 from Aug 4th 2025", () => {
    const baseDate = new Date(Date.UTC(2025, 7, 4, 0, 0, 0));
    const matcher = new InternalMatcher("43 3 * * Sun", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2025-08-10T03:43:00.000Z");
  });

  it("should match next Sunday in September or January from Aug 4th 2025", () => {
    const baseDate = new Date(Date.UTC(2025, 7, 4, 0, 0, 0));
    const matcher = new InternalMatcher("* * * January,September Sunday", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2025-09-07T00:00:00.000Z");
  });

  it("should match next Sunday in January or March from Aug 4th 2025 (crossing year boundary)", () => {
    const baseDate = new Date(Date.UTC(2025, 7, 4, 0, 0, 0));
    const matcher = new InternalMatcher("* * * January,March Sunday", baseDate, "Etc/UTC");

    assert.isFalse(matcher.isMatching());
    const matched = matcher.matchNext();
    assert.equal(matched.toISO(), "2026-01-04T00:00:00.000Z");
  });
});

describe("TimeMatcher", () => {
  describe("wildcard", () => {
    it("should accept wildcard for second", () => {
      const matcher = new TimeMatcher("* * * * * *");
      assert.isTrue(matcher.match(new Date()));
    });

    it("should accept wildcard for minute", () => {
      const matcher = new TimeMatcher("0 * * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 10, 20, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 10, 20, 1)));
    });

    it("should accept wildcard for hour", () => {
      const matcher = new TimeMatcher("0 0 * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 10, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 10, 1, 0)));
    });

    it("should accept wildcard for day", () => {
      const matcher = new TimeMatcher("0 0 0 * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 1, 0, 0)));
    });

    it("should accept wildcard for month", () => {
      const matcher = new TimeMatcher("0 0 0 1 * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 2, 0, 0, 0)));
    });

    it("should accept wildcard for week day", () => {
      const matcher = new TimeMatcher("0 0 0 1 4 *");
      assert.isTrue(matcher.match(new Date(2018, 3, 1, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 3, 2, 0, 0, 0)));
    });
  });

  describe("single value", () => {
    it("should accept single value for second", () => {
      const matcher = new TimeMatcher("5 * * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 5)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 0, 0, 6)));
    });

    it("should accept single value for minute", () => {
      const matcher = new TimeMatcher("0 5 * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 5, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 0, 6, 0)));
    });

    it("should accept single value for hour", () => {
      const matcher = new TimeMatcher("0 0 5 * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 5, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 6, 0, 0)));
    });

    it("should accept single value for day", () => {
      const matcher = new TimeMatcher("0 0 0 5 * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 5, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 6, 0, 0, 0)));
    });

    it("should accept single value for month", () => {
      const matcher = new TimeMatcher("0 0 0 1 5 *");
      assert.isTrue(matcher.match(new Date(2018, 4, 1, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 5, 1, 0, 0, 0)));
    });

    it("should accept single value for week day", () => {
      const matcher = new TimeMatcher("0 0 0 * * monday");
      assert.isTrue(matcher.match(new Date(2018, 4, 7, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 4, 8, 0, 0, 0)));
    });
  });

  describe("multiple values", () => {
    it("should accept multiple values for second", () => {
      const matcher = new TimeMatcher("5,6 * * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 5)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 6)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 0, 0, 7)));
    });

    it("should accept multiple values for minute", () => {
      const matcher = new TimeMatcher("0 5,6 * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 5, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 6, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 0, 7, 0)));
    });

    it("should accept multiple values for hour", () => {
      const matcher = new TimeMatcher("0 0 5,6 * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 5, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 6, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 7, 0, 0)));
    });

    it("should accept multiple values for day", () => {
      const matcher = new TimeMatcher("0 0 0 5,6 * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 5, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 6, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 7, 0, 0, 0)));
    });

    it("should accept multiple values for month", () => {
      const matcher = new TimeMatcher("0 0 0 1 may,june *");
      assert.isTrue(matcher.match(new Date(2018, 4, 1, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 5, 1, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 6, 1, 0, 0, 0)));
    });

    it("should accept multiple values for week day", () => {
      const matcher = new TimeMatcher("0 0 0 * * monday,tue");
      assert.isTrue(matcher.match(new Date(2018, 4, 7, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 4, 8, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 4, 9, 0, 0, 0)));
    });
  });

  describe("range", () => {
    it("should accept range for second", () => {
      const matcher = new TimeMatcher("5-7 * * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 5)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 6)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 7)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 0, 0, 8)));
    });

    it("should accept range for minute", () => {
      const matcher = new TimeMatcher("0 5-7 * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 5, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 6, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 7, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 0, 8, 0)));
    });

    it("should accept range for hour", () => {
      const matcher = new TimeMatcher("0 0 5-7 * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 5, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 6, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 7, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 8, 0, 0)));
    });

    it("should accept range for day", () => {
      const matcher = new TimeMatcher("0 0 0 5-7 * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 5, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 6, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 7, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 8, 0, 0, 0)));
    });

    it("should accept range for month", () => {
      const matcher = new TimeMatcher("0 0 0 1 may-july *");
      assert.isTrue(matcher.match(new Date(2018, 4, 1, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 5, 1, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 6, 1, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 7, 1, 0, 0, 0)));
    });

    it("should accept range for week day", () => {
      const matcher = new TimeMatcher("0 0 0 * * monday-wed");
      assert.isTrue(matcher.match(new Date(2018, 4, 7, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 4, 8, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 4, 9, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 4, 10, 0, 0, 0)));
    });
  });

  describe("step values", () => {
    it("should accept step values for second", () => {
      const matcher = new TimeMatcher("*/2 * * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 2)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 6)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 0, 0, 7)));
    });

    it("should accept step values for minute", () => {
      const matcher = new TimeMatcher("0 */2 * * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 2, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 6, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 0, 7, 0)));
    });

    it("should accept step values for hour", () => {
      const matcher = new TimeMatcher("0 0 */2 * * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 2, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 6, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 1, 7, 0, 0)));
    });

    it("should accept step values for day", () => {
      const matcher = new TimeMatcher("0 0 0 */2 * *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 3, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 0, 5, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 0, 6, 0, 0, 0)));
    });

    it("should accept step values for month", () => {
      const matcher = new TimeMatcher("0 0 0 1 */2 *");
      assert.isTrue(matcher.match(new Date(2018, 0, 1, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 2, 1, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 5, 1, 0, 0, 0)));
    });

    it("should accept step values for week day", () => {
      const matcher = new TimeMatcher("0 0 0 * * */2");
      assert.isTrue(matcher.match(new Date(2018, 4, 6, 0, 0, 0)));
      assert.isTrue(matcher.match(new Date(2018, 4, 8, 0, 0, 0)));
      assert.isFalse(matcher.match(new Date(2018, 4, 9, 0, 0, 0)));
    });
  });

  describe("timezone", () => {
    it("should match with timezone America/Sao_Paulo", () => {
      const matcher = new TimeMatcher("0 0 0 * * *", "America/Sao_Paulo");
      const utcTime = new Date("Thu Oct 11 2018 03:00:00Z");
      assert.isTrue(matcher.match(utcTime));
    });

    it("should match with timezone Europe/Rome", () => {
      const matcher = new TimeMatcher("0 0 0 * * *", "Europe/Rome");
      const utcTime = new Date("Thu Oct 11 2018 22:00:00Z");
      assert.isTrue(matcher.match(utcTime));
    });
  });

  describe("getNextMatch", () => {
    it("should return next match", () => {
      const matcher = new TimeMatcher("1 0 * * *", "Etc/UTC");
      const nextMatch = matcher.getNextMatch(new Date(Date.UTC(2025, 4, 20, 18, 0, 0)));
      const expected = new Date(Date.UTC(2025, 4, 21, 0, 1, 0));
      assert.deepEqual(nextMatch, expected);
    });
  });
});
