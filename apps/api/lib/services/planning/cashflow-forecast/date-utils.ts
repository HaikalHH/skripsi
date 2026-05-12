export const DAY_MS = 24 * 60 * 60 * 1000;

export const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const clampDayOfMonth = (year: number, month: number, dayOfMonth: number) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(dayOfMonth, lastDay));
};

export const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));

export const endOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));

const endOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

const createMonthDate = (year: number, month: number, dayOfMonth: number) =>
  new Date(Date.UTC(year, month, clampDayOfMonth(year, month, dayOfMonth), 0, 0, 0, 0));

export const getLastPayday = (now: Date, salaryDate: number) => {
  const currentMonthPayday = createMonthDate(now.getUTCFullYear(), now.getUTCMonth(), salaryDate);
  if (currentMonthPayday.getTime() <= now.getTime()) {
    return currentMonthPayday;
  }

  return createMonthDate(now.getUTCFullYear(), now.getUTCMonth() - 1, salaryDate);
};

export const getNextPayday = (now: Date, salaryDate: number) => {
  const currentMonthPayday = createMonthDate(now.getUTCFullYear(), now.getUTCMonth(), salaryDate);
  if (currentMonthPayday.getTime() > now.getTime()) {
    return currentMonthPayday;
  }

  return createMonthDate(now.getUTCFullYear(), now.getUTCMonth() + 1, salaryDate);
};

export const wholeDayDiff = (start: Date, end: Date) =>
  Math.max(0, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));

export const getWeekendEnd = (now: Date) => {
  const daysUntilSunday = now.getUTCDay() === 0 ? 0 : 7 - now.getUTCDay();
  return endOfUtcDay(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday, 12, 0, 0, 0))
  );
};

export const getTomorrowEnd = (now: Date) =>
  endOfUtcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12, 0, 0, 0)));
