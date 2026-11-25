import { describe, expect, it } from "vitest";
import { formatMarathonStartCountdown } from "../../src/ts/utils/contest-marathon";

describe("formatMarathonStartCountdown", () => {
  const second = 1000;
  const hour = 3600 * second;
  const day = 24 * hour;

  it.each([
    [4 * hour + 55 * 60 * second + 39 * second, "04:55:39"],
    [day - second, "23:59:59"],
    [day, "1d 00:00:00"],
    [12 * day + hour + 2 * second, "12d 01:00:02"],
    [0, "00:00:00"],
    [-5 * second, "00:00:00"],
  ])("formats %s ms", (remainingMs, expected) => {
    expect(formatMarathonStartCountdown(remainingMs)).toBe(expected);
  });
});
