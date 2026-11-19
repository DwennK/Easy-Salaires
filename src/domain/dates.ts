export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

export function displayDate(value: string): string {
  return isCalendarDate(value)
    ? `${value.slice(8)}/${value.slice(5, 7)}/${value.slice(2, 4)}`
    : value;
}

export function parseDateInput(
  input: string,
  previous: string,
  pastOnly: boolean,
  currentYear = new Date().getFullYear(),
): string | undefined {
  if (isCalendarDate(input)) return input;
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(input);
  if (!parts) return undefined;
  const [, day, month, year] = parts;
  let fullYear = year!;
  if (fullYear.length === 2) {
    if (isCalendarDate(previous) && previous.slice(2, 4) === year)
      fullYear = previous.slice(0, 4);
    else {
      const lastYear = pastOnly ? currentYear : currentYear + 49;
      let candidate = lastYear - (lastYear % 100) + Number(year);
      if (candidate > lastYear) candidate -= 100;
      fullYear = String(candidate);
    }
  }
  const date = `${fullYear}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  return isCalendarDate(date) ? date : undefined;
}

export function displayInstant(
  value: string | Date,
  timeZone?: string,
  time?: "minutes" | "seconds",
): string {
  const instant = new Date(value);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(instant);
  if (!time) return date;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: time === "seconds" ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(instant);
  return `${date} ${clock}`;
}
