import {
  CRITICAL_REMINDER_PRIORITY,
  getReminderTypePriority
} from "@/lib/services/reminders/dispatch/priority";
import { startOfUtcDay } from "@/lib/services/reminders/dispatch/time";
import { type ReminderCandidate } from "@/lib/services/reminders/dispatch/types";

const DIGEST_PREVIEW_LIMIT = 3;

const summarizeReminderCandidate = (candidate: ReminderCandidate) =>
  candidate.message
    .split("\n")[0]
    .replace(/^Reminder [^:]+:\s*/i, "")
    .replace(/^Review Mingguan:\s*/i, "")
    .replace(/^Closing Bulanan:\s*/i, "")
    .trim();

const isCriticalReminderCandidate = (candidate: ReminderCandidate) =>
  candidate.priority >= CRITICAL_REMINDER_PRIORITY;

const buildReminderDigestCandidate = (params: {
  candidates: ReminderCandidate[];
  baseDate: Date;
}): ReminderCandidate => {
  const previewLines = params.candidates
    .slice(0, DIGEST_PREVIEW_LIMIT)
    .map((candidate) => `- ${summarizeReminderCandidate(candidate)}`);
  const hiddenCount = Math.max(0, params.candidates.length - DIGEST_PREVIEW_LIMIT);

  return {
    reminderType: "daily_digest",
    marker: `Reminder Digest ${startOfUtcDay(params.baseDate).toISOString().slice(0, 10)}`,
    message: [
      "Ringkasan reminder penting hari ini:",
      ...previewLines,
      hiddenCount > 0 ? `- Dan ${hiddenCount} reminder lain yang sejenis.` : null
    ]
      .filter(Boolean)
      .join("\n"),
    since: startOfUtcDay(params.baseDate),
    priority: getReminderTypePriority("daily_digest")
  };
};

export const buildReminderDispatchPlan = (params: {
  candidates: ReminderCandidate[];
  remainingDailyCapacity: number;
  baseDate: Date;
}): ReminderCandidate[] => {
  const sortedCandidates = [...params.candidates].sort(
    (left, right) => right.priority - left.priority
  );

  if (params.remainingDailyCapacity <= 0 || !sortedCandidates.length) {
    return [];
  }

  if (sortedCandidates.length <= params.remainingDailyCapacity) {
    return sortedCandidates;
  }

  if (params.remainingDailyCapacity === 1) {
    const secondPriority = sortedCandidates[1]?.priority ?? 0;
    if (sortedCandidates[0].priority >= CRITICAL_REMINDER_PRIORITY && secondPriority <= 75) {
      return [sortedCandidates[0]];
    }

    return [
      buildReminderDigestCandidate({
        candidates: sortedCandidates,
        baseDate: params.baseDate
      })
    ];
  }

  const criticalCandidates = sortedCandidates
    .filter((candidate) => isCriticalReminderCandidate(candidate))
    .slice(0, params.remainingDailyCapacity);
  if (criticalCandidates.length >= params.remainingDailyCapacity) {
    return criticalCandidates;
  }

  const directMarkers = new Set(criticalCandidates.map((candidate) => candidate.marker));
  const remainingCandidates = sortedCandidates.filter(
    (candidate) => !directMarkers.has(candidate.marker)
  );
  const remainingSlots = params.remainingDailyCapacity - criticalCandidates.length;
  if (remainingCandidates.length <= remainingSlots) {
    return [...criticalCandidates, ...remainingCandidates];
  }

  const directCandidates = [
    ...criticalCandidates,
    ...remainingCandidates.slice(0, Math.max(0, remainingSlots - 1))
  ];
  const deferredCandidates = remainingCandidates.slice(Math.max(0, remainingSlots - 1));
  if (deferredCandidates.length < 2) {
    return [...directCandidates, ...deferredCandidates];
  }

  return [
    ...directCandidates,
    buildReminderDigestCandidate({
      candidates: deferredCandidates,
      baseDate: params.baseDate
    })
  ];
};
