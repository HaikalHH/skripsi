import { DATE_LABEL_FORMATTER } from "./date-utils";
import type { CashflowForecastHorizon } from "./types";

export const buildHorizonLabel = (horizon: CashflowForecastHorizon, targetDate: Date) => {
  if (horizon === "PAYDAY") {
    return `sampai gajian berikutnya pada ${DATE_LABEL_FORMATTER.format(targetDate)}`;
  }
  if (horizon === "NEXT_7_DAYS") {
    return `untuk 7 hari ke depan sampai ${DATE_LABEL_FORMATTER.format(targetDate)}`;
  }
  if (horizon === "WEEKEND") {
    return `sampai akhir pekan pada ${DATE_LABEL_FORMATTER.format(targetDate)}`;
  }
  if (horizon === "TOMORROW") {
    return `sampai besok pada ${DATE_LABEL_FORMATTER.format(targetDate)}`;
  }
  return `sampai akhir bulan pada ${DATE_LABEL_FORMATTER.format(targetDate)}`;
};

export const pickExpenseRunRate = (params: {
  cycleExpense: number;
  cycleDays: number;
  rollingExpense: number;
  rollingDays: number;
  monthlyExpenseProfile: number;
  daysInMonth: number;
}) => {
  if (params.cycleExpense > 0 && params.cycleDays >= 3) {
    return {
      value: params.cycleExpense / Math.max(1, params.cycleDays),
      source: "transaksi berjalan"
    };
  }

  if (params.rollingExpense > 0) {
    return {
      value: params.rollingExpense / Math.max(1, params.rollingDays),
      source: "30 hari terakhir"
    };
  }

  if (params.monthlyExpenseProfile > 0) {
    return {
      value: params.monthlyExpenseProfile / Math.max(1, params.daysInMonth),
      source: "profil bulanan"
    };
  }

  return {
    value: 0,
    source: "belum cukup data"
  };
};
