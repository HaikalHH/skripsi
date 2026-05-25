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
import type { OnboardingOption } from "@/lib/services/onboarding/flow/shared/questions/question-types";

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  timeZone: "Asia/Jakarta"
});

const getCurrentJakartaMonthParts = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).formatToParts(new Date());

  return {
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1") - 1,
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970")
  };
};

const formatMonthName = (year: number, month: number) =>
  monthFormatter.format(new Date(Date.UTC(year, month, 1, 12)));

const getCyclePeriodExample = (payday: number | null | undefined) => {
  if (!payday || payday < 1 || payday > 31) return null;

  const { month, year } = getCurrentJakartaMonthParts();
  const endDay = payday === 1 ? new Date(Date.UTC(year, month + 1, 0)).getUTCDate() : payday - 1;
  const endMonth = payday === 1 ? month : month + 1;
  const endYear = year + Math.floor(endMonth / 12);
  const normalizedEndMonth = endMonth % 12;

  return `${payday} ${formatMonthName(year, month)} - ${endDay} ${formatMonthName(
    endYear,
    normalizedEndMonth
  )}`;
};

const getActiveIncomeCycleConfirmOptions = (payday: number | null | undefined): OnboardingOption[] => [
  { value: "YES", label: `Ya, pakai tanggal ${payday ?? "-"}` },
  { value: "NO", label: "Tidak, lanjut dulu" }
];

export const getIncomePrompt: PromptFlowHandler = ({ step, context }) => {
  switch (step) {
    case OnboardingStep.ASK_EMPLOYMENT_TYPES:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.EMPLOYMENT_TYPES,
        title: "Pola Income",
        body: [
          "👤 Boss sekarang lagi berperan sebagai apa?",
          "",
          "Biar aku bisa kasih saran keuangan yang lebih sesuai, pilih aktivitas atau kondisi yang paling menggambarkan Boss saat ini.",
          "",
          "Boleh pilih lebih dari satu ya."
        ].join("\n"),
        inputType: "multi_select",
        optionHeading: null,
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
        body: "💸 Biasanya Boss gajian berapa kali dalam sebulan?",
        inputType: "single_select",
        optionHeading: null,
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
            ? `💰Income aktif ke-${activeIncomeNumber} nominalnya berapa Boss?`
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
      const cyclePayday = context.activeIncomeLatestPayday ?? null;
      const cycleExample = getCyclePeriodExample(cyclePayday);
      return {
        stepKey: step,
        questionKey: QUESTION_ACTIVE_INCOME_CYCLE_CONFIRM,
        title: "Awal Periode Report",
        body: [
          `📅 Mau pakai tanggal ${cyclePayday ?? "-"} sebagai awal periode bulanan, Boss?`,
          "",
          `Nanti laporan seperti monthly report dan cashflow report akan dihitung dari tanggal ${cyclePayday ?? "-"} ke tanggal ${
            cyclePayday ? (cyclePayday === 1 ? "akhir" : cyclePayday - 1) : "-"
          } bulan berikutnya.`,
          "",
          "Contoh:",
          cycleExample ?? "-",
          "",
          "Balas:"
        ].join("\n"),
        inputType: "single_select",
        optionHeading: null,
        options: getActiveIncomeCycleConfirmOptions(cyclePayday)
      };
    case STEP_ACTIVE_INCOME_ADD_MORE:
      return {
        stepKey: step,
        questionKey: QUESTION_ACTIVE_INCOME_ADD_MORE,
        title: "Tambah Income Aktif?",
        body: "💸 Masih ada income aktif lain Boss?, atau sudah itu aja?",
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
        body: "💰Selain itu ada income pasif juga Boss?",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case OnboardingStep.ASK_PASSIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PASSIVE_INCOME_MONTHLY,
        title: "Income Pasif",
        body: [
          "💼 Pemasukan sampingan Boss kira-kira berapa per bulan?",
          "",
          "Boleh isi nominal pasti atau kisaran.",
          "",
          "Contoh:",
          "2 juta",
          "sekitar 7 juta",
          "1-5 juta"
        ].join("\n"),
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
