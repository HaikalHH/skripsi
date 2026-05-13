export const JAKARTA_UTC_OFFSET_HOURS = 7;

export const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

export const getJakartaDayBounds = (baseDate: Date, offsetDays = 0) => {
  const jakartaDate = new Date(baseDate.getTime() + JAKARTA_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const start = new Date(
    Date.UTC(
      jakartaDate.getUTCFullYear(),
      jakartaDate.getUTCMonth(),
      jakartaDate.getUTCDate() + offsetDays,
      -JAKARTA_UTC_OFFSET_HOURS,
      0,
      0,
      0
    )
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
};

export const isWithinJakartaHour = (baseDate: Date, targetHour: number) => {
  const jakartaDate = new Date(baseDate.getTime() + JAKARTA_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return jakartaDate.getUTCHours() === targetHour;
};

export const formatJakartaDateKey = (date: Date) => {
  const jakartaDate = new Date(date.getTime() + JAKARTA_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const year = jakartaDate.getUTCFullYear();
  const month = String(jakartaDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jakartaDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getPreviousMonthRange = (baseDate: Date) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 0, 23, 59, 59, 999));
  return {
    start,
    end,
    label: new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric"
    }).format(start)
  };
};

export const getRollingWeekRanges = (baseDate: Date) => {
  const currentEnd = new Date(baseDate);
  const currentStart = startOfUtcDay(baseDate);
  currentStart.setUTCDate(currentStart.getUTCDate() - 6);

  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - 7);

  return { currentStart, currentEnd, previousStart, previousEnd };
};

export const signedDayDiff = (start: Date, end: Date) =>
  Math.round((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / (24 * 60 * 60 * 1000));

export const clampDayOfMonth = (year: number, month: number, dayOfMonth: number) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(dayOfMonth, lastDay));
};

export const createMonthDate = (year: number, month: number, dayOfMonth: number) =>
  new Date(Date.UTC(year, month, clampDayOfMonth(year, month, dayOfMonth), 0, 0, 0, 0));

export const getJakartaDateParts = (date: Date) => {
  const jakartaDate = new Date(date.getTime() + JAKARTA_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: jakartaDate.getUTCFullYear(),
    month: jakartaDate.getUTCMonth(),
    day: jakartaDate.getUTCDate()
  };
};
