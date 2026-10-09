import Decimal from "decimal.js";
Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export { Decimal };
export function d(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  const cleaned =
    typeof value === "string"
      ? value
          .trim()
          .replace(/[’'\s]/g, "")
          .replace(",", ".")
      : String(value);
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error("invalidNumber");
  const result = new Decimal(cleaned);
  if (!result.isFinite() || result.abs().gt("1000000000"))
    throw new Error("invalidNumber");
  return result;
}
export function cents(value: Decimal | string | number): number {
  const n = d(value).mul(100).toDecimalPlaces(0).toNumber();
  if (!Number.isSafeInteger(n)) throw new Error("invalidNumber");
  return n;
}
export const francs = (value: number): string =>
  new Decimal(value).div(100).toFixed(2);
export const sum = (values: number[]): number =>
  values.reduce((a, b) => a + b, 0);
export const money = (value: number, lang = "fr"): string =>
  new Intl.NumberFormat(lang === "fr" ? "fr-CH" : "en-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
