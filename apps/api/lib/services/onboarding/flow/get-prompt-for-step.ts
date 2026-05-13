import type { OnboardingStep } from "@prisma/client";
import type {
  OnboardingPrompt,
  OnboardingPromptContext
} from "@/lib/services/onboarding/flow/shared/questions/question-types";
import { getStartAndTargetsPrompt } from "@/lib/services/onboarding/flow/01-start-and-targets/prompts";
import { getIncomePrompt } from "@/lib/services/onboarding/flow/02-income/prompts";
import { getExpensesPrompt } from "@/lib/services/onboarding/flow/03-expenses/prompts";
import { getGoalPlanningPrompt } from "@/lib/services/onboarding/flow/04-goal-planning/prompts";
import { getAssetsPrompt } from "@/lib/services/onboarding/flow/05-assets/prompts";
import { getCompletionPrompt } from "@/lib/services/onboarding/flow/06-completion/prompts";
import { getTargetMonthYearExamples } from "@/lib/services/onboarding/flow/helpers/month-year-examples";
import type { PromptFlowHandler } from "@/lib/services/onboarding/flow/helpers/prompt-handler-types";

const PROMPT_FLOWS: PromptFlowHandler[] = [
  getStartAndTargetsPrompt,
  getIncomePrompt,
  getExpensesPrompt,
  getGoalPlanningPrompt,
  getAssetsPrompt,
  getCompletionPrompt
];

export const getPromptForStep = (
  step: OnboardingStep,
  context: OnboardingPromptContext
): OnboardingPrompt => {
  const targetMonthYearExamples = getTargetMonthYearExamples();

  for (const getFlowPrompt of PROMPT_FLOWS) {
    const prompt = getFlowPrompt({
      step,
      context,
      targetMonthYearExamples
    });

    if (prompt) return prompt;
  }

  throw new Error(`Unsupported onboarding step: ${step}`);
};
