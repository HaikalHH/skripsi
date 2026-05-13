import { OnboardingQuestionKey, OnboardingStep } from "@prisma/client";
import { PERSONALIZATION_OPTIONS } from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import type { PromptFlowHandler } from "@/lib/services/onboarding/flow/helpers/prompt-handler-types";

export const getCompletionPrompt: PromptFlowHandler = ({ step }) => {
  switch (step) {
    case OnboardingStep.ASK_PERSONALIZATION_CHOICE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PERSONALIZATION_CHOICE,
        title: "Lanjut Biar Makin Akurat",
        body: [
          "Analisa awalnya sudah kebentuk.",
          "Kalau mau, saya bisa lanjut rapihin detail target, strategi tabung, dan proyeksi yang lebih tajam sekarang.",
          "Kalau belum, saya tutup dulu dengan rangkuman yang ada."
        ].join("\n"),
        inputType: "single_select",
        options: PERSONALIZATION_OPTIONS
      };
    case OnboardingStep.SHOW_ANALYSIS:
    case OnboardingStep.COMPLETED:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.START_CONFIRMATION,
        title: "Onboarding Selesai",
        body: "Onboarding sudah selesai.",
        inputType: "text"
      };
    default:
      return null;
  }
};
