import type { OnboardingStep } from "@prisma/client";
import type {
  OnboardingPrompt,
  OnboardingPromptContext
} from "@/lib/services/onboarding/flow/shared/questions/question-types";

export type TargetMonthYearExamples = {
  numeric: string;
  long: string;
};

export type PromptFlowParams = {
  step: OnboardingStep;
  context: OnboardingPromptContext;
  targetMonthYearExamples: TargetMonthYearExamples;
};

export type PromptFlowHandler = (params: PromptFlowParams) => OnboardingPrompt | null;
