import { EmploymentType, OnboardingQuestionKey, type OnboardingSession } from "@prisma/client";
import {
  getSessionNormalizedValue,
  latestSessionForQuestion
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import { getConfirmedSessions } from "@/lib/services/onboarding/flow/helpers/session-values";

export const getEmploymentTypes = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<EmploymentType[]>(
    latestSessionForQuestion(
      getConfirmedSessions(sessions),
      OnboardingQuestionKey.EMPLOYMENT_TYPES
    )
  ) ?? [];
