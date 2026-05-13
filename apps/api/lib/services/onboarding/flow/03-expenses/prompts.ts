import { OnboardingQuestionKey, OnboardingStep } from "@prisma/client";
import {
  BUDGET_MODE_OPTIONS,
  YES_NO_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import type { PromptFlowHandler } from "@/lib/services/onboarding/flow/helpers/prompt-handler-types";

export const getExpensesPrompt: PromptFlowHandler = ({ step, context }) => {
  switch (step) {
    case OnboardingStep.ASK_BUDGET_MODE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.BUDGET_MODE,
        title: "Mulai Dari Mana",
        body: "Biar saya bisa bantu lebih pas, enaknya kita mulai lihat pengeluaran kamu lewat cara yang mana Boss?",
        inputType: "single_select",
        options: BUDGET_MODE_OPTIONS
      };
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.MANUAL_EXPENSE_BREAKDOWN,
        title: "Cerita Pengeluaran",
        body: [
          "Ceritain aja pengeluaran bulanan kamu dengan gaya santai Boss.",
          "Saya bantu rapihin. Kalau ada kebutuhan lain seperti keluarga, cicilan, atau urusan rumah, tinggal tulis aja juga.",
          "",
          "Contoh kalau mau:",
          "Makan: 1500000",
          "Transport: 500000",
          "Tagihan: 700000",
          "Hiburan: 800000",
          "Lainnya: 300000"
        ].join("\n"),
        inputType: "text"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_FOOD,
        title: "Mulai Dari Yang Paling Rutin",
        body: context.goalExpenseStrategy === "HELP_CALCULATE"
          ? "Oke Boss, kita urutin pelan-pelan ya. Biasanya buat makan dan minum per bulan sekitar berapa?"
          : "Biasanya pengeluaran makan dan minum per bulan sekitar berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT,
        title: "Pengeluaran Transport",
        body: "Kalau buat transport dan perjalanan rutin, biasanya habis berapa per bulan Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_BILLS,
        title: "Pengeluaran Tagihan",
        body: "Kalau untuk tagihan rutin seperti listrik, internet, cicilan, atau kewajiban lain, biasanya berapa per bulan Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT,
        title: "Pengeluaran Hiburan",
        body: "Kalau buat hiburan, nongkrong, streaming, atau lifestyle, biasanya habis berapa per bulan Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS:
      if (context.guidedOtherExpenseStage === "category_name") {
        return {
          stepKey: step,
          questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
          title: "Kategori Pengeluaran Lain",
          body: [
            "Siap Boss. Kategori pengeluaran lainnya apa?",
            "Contoh: `parkir`, `jajan kantor`, atau `bantuan keluarga`."
          ].join("\n\n"),
          inputType: "text"
        };
      }

      if (context.guidedOtherExpenseStage === "category_amount") {
        return {
          stepKey: step,
          questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
          title: "Nominal Pengeluaran Lain",
          body: `Untuk ${context.guidedOtherExpensePendingLabel ?? "kategori ini"}, biasanya habis berapa per bulan Boss?`,
          inputType: "money"
        };
      }

      if (context.guidedOtherExpenseStage === "add_more") {
        return {
          stepKey: step,
          questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
          title: "Tambah Pengeluaran Lain?",
          body: "Masih ada pengeluaran lain lagi nggak Boss? Balas `ada` atau `ga ada` ya.",
          inputType: "single_select",
          options: YES_NO_OPTIONS
        };
      }

      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
        title: "Pengeluaran Lainnya",
        body: "Di luar makan, transport, tagihan, dan hiburan tadi, masih ada pengeluaran lain nggak Boss? Balas `ada` atau `ga ada` ya.",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    default:
      return null;
  }
};
