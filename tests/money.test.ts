import { describe, expect, it } from "vitest";
import { cents, decimalText, formatNumber, money } from "../src/domain/money";

describe("decimal point display", () => {
  it.each(["fr", "en"])("formats money and PDF bases/rates in %s", (lang) => {
    expect(money(6250, lang)).toBe("62.50");
    expect(money(-6250, lang)).toBe("-62.50");
    expect(money(0, lang)).toBe("0.00");
    expect(money(455980, lang).replace(/[\s’']/g, "")).toBe("4559.80");
    expect(formatNumber(5.3, lang)).toBe("5.3");
    expect(formatNumber(0.12345678, lang)).toBe("0.12345678");
    expect(formatNumber(62.5, lang, 2)).toBe("62.50");
  });

  it("keeps comma input valid and preserves precision when displaying it", () => {
    for (const raw of ["5200,30", "-62,50", "1’234,5678", "0,12345678"]) {
      expect(cents(decimalText(raw))).toBe(cents(raw));
      expect(decimalText(raw)).not.toContain(",");
    }
    expect(decimalText("5200,30")).toBe("5200.30");
    expect(decimalText("0,")).toBe("0.");
    expect(decimalText(null)).toBe("");
    expect(decimalText(undefined)).toBe("");
  });
});
