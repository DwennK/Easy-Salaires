import { expect, it } from "vitest";
import {
  displayDate,
  displayInstant,
  parseDateInput,
} from "../src/domain/dates";

it("round trips day-first dates without losing an existing century", () => {
  expect(displayDate("2026-11-30")).toBe("30/11/26");
  expect(parseDateInput("30/11/26", "", false, 2026)).toBe("2026-11-30");
  expect(parseDateInput("12/04/85", "", true, 2026)).toBe("1985-04-12");
  expect(parseDateInput("12/04/20", "1920-04-11", true, 2026)).toBe(
    "1920-04-12",
  );
  expect(parseDateInput("12/04/1920", "", true, 2026)).toBe("1920-04-12");
  expect(parseDateInput("29/02/24", "", false, 2026)).toBe("2024-02-29");
  expect(parseDateInput("29/02/26", "", false, 2026)).toBeUndefined();
  expect(parseDateInput("11/30/26", "", false, 2026)).toBeUndefined();
  expect(displayDate("")).toBe("");
});

it("formats timestamps on the calendar day in the specified time zone", () => {
  const time = "2026-10-08T22:30:00Z";
  expect(displayInstant(time, "Europe/Zurich")).toBe("09/10/26");
  expect(displayInstant(time, "UTC", "minutes")).toBe("08/10/26 22:30");
});
