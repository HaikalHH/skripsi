import { isRecurringLikeMerchant } from "../merchant";
import type { RecurringCadence } from "./types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getSortedIntervals = (dates: Date[]) => {
  if (dates.length < 2) return [];
  const sortedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  return sortedDates
    .slice(1)
    .map((date, index) => (date.getTime() - sortedDates[index].getTime()) / (24 * 60 * 60 * 1000));
};

const getAverageIntervalDays = (dates: Date[]) => {
  const intervals = getSortedIntervals(dates);
  if (!intervals.length) return null;
  return intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
};

const getIntervalStdDev = (dates: Date[]) => {
  const intervals = getSortedIntervals(dates);
  if (intervals.length < 2) return null;

  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const variance =
    intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length;
  return Math.sqrt(variance);
};

export const detectCadence = (dates: Date[]): RecurringCadence => {
  const averageInterval = getAverageIntervalDays(dates);
  if (averageInterval === null) return "irregular";

  if (averageInterval >= 5 && averageInterval <= 10) return "weekly";
  if (averageInterval >= 20 && averageInterval <= 40) return "monthly";
  return "irregular";
};

export const buildConfidenceScore = (params: {
  count: number;
  cadence: RecurringCadence;
  label: string;
  dates: Date[];
}) => {
  let score = params.count >= 4 ? 0.58 : params.count >= 3 ? 0.48 : 0.34;
  if (params.cadence !== "irregular") score += 0.17;
  if (isRecurringLikeMerchant(params.label)) score += 0.15;

  const stdDev = getIntervalStdDev(params.dates);
  if (stdDev !== null) {
    if (stdDev <= 2) score += 0.12;
    else if (stdDev <= 5) score += 0.07;
    else if (stdDev <= 8) score += 0.03;
  }

  return clamp(score, 0.2, 0.98);
};

export const predictNextExpectedAt = (dates: Date[]) => {
  const averageInterval = getAverageIntervalDays(dates);
  if (averageInterval === null) return null;

  const sortedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  const lastDate = sortedDates.at(-1);
  if (!lastDate) return null;

  return new Date(lastDate.getTime() + averageInterval * 24 * 60 * 60 * 1000);
};
