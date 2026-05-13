import { OnboardingQuestionKey, type OnboardingSession } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { upsertIncomeProfile } from "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service";
import {
  getSessionNormalizedValue,
  latestSessionForQuestion
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import {
  QUESTION_ACTIVE_INCOME_COUNT,
  QUESTION_ACTIVE_INCOME_CYCLE_CONFIRM,
  STEP_ACTIVE_INCOME_COUNT,
  STEP_ACTIVE_INCOME_CYCLE_CONFIRM
} from "@/lib/services/onboarding/flow/helpers/custom-step-keys";

export {
  QUESTION_ACTIVE_INCOME_COUNT,
  QUESTION_ACTIVE_INCOME_CYCLE_CONFIRM,
  STEP_ACTIVE_INCOME_COUNT,
  STEP_ACTIVE_INCOME_CYCLE_CONFIRM
};

const getOnboardingSessionModel = () => (prisma as { onboardingSession?: any }).onboardingSession;

const getConfirmedSessionValues = <T>(
  sessions: OnboardingSession[],
  questionKey: OnboardingQuestionKey
) =>
  sessions
    .filter((session) => session.isCompleted === true && session.questionKey === questionKey)
    .map((session) => getSessionNormalizedValue<T>(session))
    .filter((value): value is T => value !== null && value !== undefined);

export const getActiveIncomeOnboardingState = (params: {
  sessions: OnboardingSession[];
  salaryDate: number | null;
}) => {
  const activeIncomeCount =
    getSessionNormalizedValue<number>(
      latestSessionForQuestion(
        params.sessions.filter((session) => session.isCompleted === true),
        QUESTION_ACTIVE_INCOME_COUNT
      )
    ) ?? null;
  const activeIncomeAmounts = getConfirmedSessionValues<number>(
    params.sessions,
    OnboardingQuestionKey.ACTIVE_INCOME_MONTHLY
  );
  const activeIncomePaydays = getConfirmedSessionValues<number>(
    params.sessions,
    OnboardingQuestionKey.SALARY_DATE
  );
  const activeIncomeLatestPayday = activeIncomePaydays.at(-1) ?? null;

  return {
    activeIncomeCount,
    activeIncomeAmounts,
    activeIncomePaydays,
    activeIncomeLatestPayday,
    activeIncomeCycleStartDay: params.salaryDate
  };
};

export const syncActiveIncomeProfileFromSessions = async (userId: string) => {
  const onboardingSessionModel = getOnboardingSessionModel();
  if (!onboardingSessionModel) return;
  const sessions = (await onboardingSessionModel.findMany({
    where: {
      userId,
      questionKey: OnboardingQuestionKey.ACTIVE_INCOME_MONTHLY,
      isCompleted: true
    },
    orderBy: { createdAt: "asc" }
  })) as OnboardingSession[];
  const total = sessions
    .map((session) => getSessionNormalizedValue<number>(session))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
  await upsertIncomeProfile({ userId, activeIncomeMonthly: total });
};
