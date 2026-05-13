import { FinancialGoalType, OnboardingQuestionKey, OnboardingStep } from "@prisma/client";
import {
  ADD_MORE_OPTIONS,
  GOAL_ALLOCATION_MODE_OPTIONS,
  GOAL_EXPENSE_STRATEGY_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import {
  buildGoalPriorityOptions,
  goalLabel
} from "@/lib/services/onboarding/flow/shared/questions/display-labels";
import type { PromptFlowHandler } from "@/lib/services/onboarding/flow/helpers/prompt-handler-types";

export const getGoalPlanningPrompt: PromptFlowHandler = ({
  step,
  context,
  targetMonthYearExamples
}) => {
  switch (step) {
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_CUSTOM_NAME,
        title: "Custom Target",
        body: "Nama target custom ini mau kamu sebut apa Boss?",
        inputType: "text"
      };
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
        title: goalLabel(context.currentGoalType),
        body:
          context.currentGoalType === FinancialGoalType.HOUSE
            ? "Untuk target rumah, kira-kira dana yang mau disiapkan berapa Boss?"
            : context.currentGoalType === FinancialGoalType.VEHICLE
              ? "Untuk target kendaraan, kira-kira dana yang mau disiapkan berapa Boss?"
              : context.currentGoalType === FinancialGoalType.VACATION
                ? "Untuk target liburan, kira-kira dana yang mau disiapkan berapa Boss?"
                : context.currentGoalType === FinancialGoalType.CUSTOM
                  ? "Untuk target ini, butuh dana berapa Boss?"
                  : "Kira-kira dana yang dibutuhin berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GOAL_TARGET_DATE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
        title: "Waktu Target",
        body:
          context.currentGoalType === FinancialGoalType.CUSTOM
            ? `${context.latestCustomGoalName?.trim() || "Target ini"} maunya tercapai kapan Boss? Balas bulan dan tahun ya. Contohnya \`${targetMonthYearExamples.numeric}\` atau \`${targetMonthYearExamples.long}\`.`
            : `Kalau target ${goalLabel(context.currentGoalType).toLowerCase()} ini, maunya tercapai kapan Boss? Balas bulan dan tahun ya. Contohnya \`${targetMonthYearExamples.numeric}\` atau \`${targetMonthYearExamples.long}\`.`,
        inputType: "month"
      };
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_EXPENSE_STRATEGY,
        title: "Biar Rencananya Pas",
        body: [
          "Supaya saya bisa bantu dengan lebih pas, saya perlu gambaran pengeluaran bulanan kamu dulu.",
          "Paling nyaman lanjut lewat cara yang mana Boss?"
        ].join("\n"),
        inputType: "single_select",
        options: GOAL_EXPENSE_STRATEGY_OPTIONS
      };
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_EXPENSE_TOTAL,
        title: "Total Pengeluaran Bulanan",
        body: "Kalau kamu sudah punya gambaran total pengeluaran bulanan, kirim angkanya aja ya Boss.",
        inputType: "money"
      };
    case OnboardingStep.ASK_GOAL_ALLOCATION_MODE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_ALLOCATION_MODE,
        title: "Cara Jalanin Target",
        body: "Kalau targetnya lebih dari satu, kamu lebih nyaman fokus satu-satu dulu atau jalan bareng Boss?",
        inputType: "single_select",
        options: GOAL_ALLOCATION_MODE_OPTIONS
      };
    case OnboardingStep.ASK_GOAL_PRIORITY_FOCUS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_PRIORITY_FOCUS,
        title: "Target Prioritas",
        body: "Dari semua target itu, mana yang mau kamu utamakan dulu Boss?",
        inputType: "single_select",
        options: buildGoalPriorityOptions(context)
      };
    case OnboardingStep.ASK_GOAL_ADD_MORE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_ADD_MORE,
        title: "Tambah Target",
        body: "Masih ada target lain yang mau dimasukin juga Boss?",
        inputType: "single_select",
        options: ADD_MORE_OPTIONS
      };
    default:
      return null;
  }
};
