import { OnboardingQuestionKey, OnboardingStep } from "@prisma/client";
import {
  GOAL_OPTIONS,
  START_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import type { PromptFlowHandler } from "@/lib/services/onboarding/flow/helpers/prompt-handler-types";

export const getStartAndTargetsPrompt: PromptFlowHandler = ({ step }) => {
  switch (step) {
    case OnboardingStep.WAIT_REGISTER:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.START_CONFIRMATION,
        title: "Finance Copilot",
        body: [
          "👋 Halo Boss!",
          "",
          "Aku asisten keuangan pribadi kamu 💰",
          "Siap bantu kamu ngatur uang dengan lebih rapi.",
          "",
          "Aku bisa bantu:",
          "",
          "📝 Catat pemasukan & pengeluaran",
          "📊 Pantau tabungan dan budget",
          "🎯 Bantu susun target keuangan",
          "🔍 Kasih insight dari kebiasaan finansial kamu",
          "📈 Tampilkan progres keuangan kapan saja",
          "",
          "Mulai dari hal simpel dulu ya.",
          "",
          "Kalau sudah siap, langsung balas saja ya Boss. 🚀"
        ].join("\n"),
        inputType: "single_select",
        options: START_OPTIONS
      };
    case OnboardingStep.VERIFY_PHONE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PHONE_VERIFICATION,
        title: "Aktifkan Jalur Notifikasi",
        body:
          "Satu langkah terakhir biar reminder dan follow-up bisa dikirim ke channel yang benar.\nKirim nomor WhatsApp aktif dengan format `62812xxxxxx`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_PRIMARY_GOAL:
    case OnboardingStep.ASK_GOAL_SELECTION:
      return {
        stepKey: OnboardingStep.ASK_GOAL_SELECTION,
        questionKey: OnboardingQuestionKey.GOAL_SELECTION,
        title: "Target",
        body: [
          "🎯 Mau kejar target apa dulu, Boss?",
          "",
          "Pilih satu atau beberapa target keuangan yang ingin Boss capai.",
          "Nanti aku bantu susun prioritas dan hitung rencana nabungnya satu per satu."
        ].join("\n"),
        inputType: "multi_select",
        optionHeading: "Pilihan target:",
        options: GOAL_OPTIONS
      };
    default:
      return null;
  }
};
