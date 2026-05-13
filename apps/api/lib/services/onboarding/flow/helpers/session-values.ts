import type { OnboardingSession } from "@prisma/client";

export const getConfirmedSessions = (sessions: OnboardingSession[]) =>
  sessions.filter((item) => item.isCompleted === true);

export const normalizeStoredValues = <T>(value: T | T[] | null | undefined): T[] => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value)
    ? value.filter((item): item is T => item !== null && item !== undefined)
    : [value];
};
