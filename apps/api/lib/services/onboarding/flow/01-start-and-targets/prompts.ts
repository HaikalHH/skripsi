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
          "Halo Boss",
          "",
          "Saya calon asisten keuangan pribadi anda",
          "",
          "Saya bisa membantu mencatat pemasukan & pengeluaran, memantau tabungan, memberi analisis keuangan, dan mempresentasikannya setiap saat",
          "",
          "Boss siap memulai?",
          "Kalau sudah siap, langsung balas saja ya Boss."
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
          "Pilih dulu target keuangan yang lagi pengen kamu capai.",
          "Kalau ada beberapa, boleh pilih lebih dari satu sekaligus ya Boss.",
          "Nanti saya bantu lanjutkan satu per satu sesuai kondisi kamu."
        ].join("\n"),
        inputType: "multi_select",
        options: GOAL_OPTIONS
      };
    default:
      return null;
  }
};
