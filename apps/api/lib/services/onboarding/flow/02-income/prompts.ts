import { OnboardingQuestionKey, OnboardingStep } from "@prisma/client";
import {
  ACTIVE_INCOME_FREQUENCY_OPTIONS,
  EMPLOYMENT_OPTIONS,
  YES_NO_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import type { PromptFlowHandler } from "@/lib/services/onboarding/flow/helpers/prompt-handler-types";
import {
  QUESTION_ACTIVE_INCOME_ADD_MORE,
  QUESTION_ACTIVE_INCOME_COUNT,
  QUESTION_ACTIVE_INCOME_CYCLE_CONFIRM,
  QUESTION_ACTIVE_INCOME_CYCLE_SELECT,
  STEP_ACTIVE_INCOME_ADD_MORE,
  STEP_ACTIVE_INCOME_COUNT,
  STEP_ACTIVE_INCOME_CYCLE_CONFIRM,
  STEP_ACTIVE_INCOME_CYCLE_SELECT
} from "@/lib/services/onboarding/flow/helpers/custom-step-keys";

export const getIncomePrompt: PromptFlowHandler = ({ step, context }) => {
  switch (step) {
    case OnboardingStep.ASK_EMPLOYMENT_TYPES:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.EMPLOYMENT_TYPES,
        title: "Pola Income",
        body:
          "Biar saya lebih ngerti kondisi kamu sekarang, peran atau aktivitas kamu saat ini apa aja?\nKalau campuran, boleh pilih lebih dari satu ya Boss.",
        inputType: "multi_select",
        options: EMPLOYMENT_OPTIONS
      };
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.HAS_ACTIVE_INCOME,
        title: "Income Aktif",
        body: "Sekarang ada income aktif yang rutin masuk Boss?",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case STEP_ACTIVE_INCOME_COUNT:
      return {
        stepKey: step,
        questionKey: QUESTION_ACTIVE_INCOME_COUNT,
        title: "Pola Gajian",
        body: "Dalam sebulan biasanya Boss menerima income aktif dengan pola yang mana?",
        inputType: "single_select",
        options: ACTIVE_INCOME_FREQUENCY_OPTIONS
      };
    case OnboardingStep.ASK_ACTIVE_INCOME:
      const activeIncomeNumber = Math.max(1, (context.activeIncomeAmountCount ?? 0) + 1);
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ACTIVE_INCOME_MONTHLY,
        title: "Income Aktif",
        body:
          context.activeIncomeMode === "MULTIPLE" || (context.activeIncomeCount ?? 1) > 1
            ? `Income aktif ke-${activeIncomeNumber} nominalnya berapa Boss?`
            : "Biasanya pemasukan utama kamu per bulan kira-kira berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_SALARY_DATE:
      const salaryDateNumber = Math.max(1, (context.activeIncomePaydayCount ?? 0) + 1);
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.SALARY_DATE,
        title: "Tanggal Gajian",
        body:
          context.activeIncomeMode === "MULTIPLE" || (context.activeIncomeCount ?? 1) > 1
            ? `Income aktif ke-${salaryDateNumber} biasanya masuk tanggal berapa Boss? Balas angka 1-31 ya.`
            : [
                "Biasanya Boss mulai hitung keuangan bulanan dari tanggal berapa?",
                "",
                "Contoh:",
                "- Tanggal 1, kalau ikut awal bulan",
                "- Tanggal 25, kalau gajian tanggal 25",
                "- Tanggal 28, kalau gajian tanggal 28",
                "",
                "Balas angka 1-31 ya Boss."
              ].join("\n"),
        inputType: "integer"
      };
    case STEP_ACTIVE_INCOME_CYCLE_CONFIRM:
      return {
        stepKey: step,
        questionKey: QUESTION_ACTIVE_INCOME_CYCLE_CONFIRM,
        title: "Awal Periode Report",
        body: [
          `Tanggal ${context.activeIncomeLatestPayday ?? "-"} ini mau dijadikan awal periode report bulanan Boss?`,
          "",
          "Kalau iya, nanti /monthly report dan /cashflow report mengikuti tanggal ini.",
          "Kalau bukan, saya lanjut tanya income aktif berikutnya dulu."
        ].join("\n"),
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case STEP_ACTIVE_INCOME_ADD_MORE:
      return {
        stepKey: step,
        questionKey: QUESTION_ACTIVE_INCOME_ADD_MORE,
        title: "Tambah Income Aktif?",
        body: "Masih ada income aktif lain lagi Boss, atau sudah itu aja?",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case STEP_ACTIVE_INCOME_CYCLE_SELECT:
      const paydayOptions = (context.activeIncomePaydays ?? []).map(
        (day, index) => `${index + 1}. Income aktif ke-${index + 1}, tanggal ${day}`
      );
      return {
        stepKey: step,
        questionKey: QUESTION_ACTIVE_INCOME_CYCLE_SELECT,
        title: "Pilih Awal Periode Report",
        body: [
          "Dari income aktif yang tadi, mana yang mau dijadikan awal periode report bulanan Boss?",
          "",
          ...paydayOptions,
          "",
          "Boleh jawab nomor income-nya, misalnya `income pertama`, atau tanggalnya."
        ].join("\n"),
        inputType: "integer"
      };
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.HAS_PASSIVE_INCOME,
        title: "Income Pasif",
        body: "Selain itu ada income pasif juga Boss?",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case OnboardingStep.ASK_PASSIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PASSIVE_INCOME_MONTHLY,
        title: "Income Pasif",
        body:
          "Kalau ada pemasukan sampingan yang rutin, kira-kira per bulan berapa Boss? Kalau belum pasti, boleh jawab kisaran seperti `sekitar 7jtan` atau `1-5jt`.",
        inputType: "money"
      };
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ESTIMATED_MONTHLY_INCOME,
        title: "Estimasi Income",
        body: "Kalau dirata-ratakan, total pemasukan per bulan kira-kira berapa Boss?",
        inputType: "money"
      };
    default:
      return null;
  }
};
