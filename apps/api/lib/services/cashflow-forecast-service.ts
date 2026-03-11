import { prisma } from "../prisma";
import { formatMoney } from "./money-format";

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const hasAnyPhrase = (text: string, phrases: string[]) => phrases.some((phrase) => text.includes(phrase));

const clampDayOfMonth = (year: number, month: number, dayOfMonth: number) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(dayOfMonth, lastDay));
};

const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));

const endOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));

const createMonthDate = (year: number, month: number, dayOfMonth: number) =>
  new Date(Date.UTC(year, month, clampDayOfMonth(year, month, dayOfMonth), 0, 0, 0, 0));

const getLastPayday = (now: Date, salaryDate: number) => {
  const currentMonthPayday = createMonthDate(now.getUTCFullYear(), now.getUTCMonth(), salaryDate);
  if (currentMonthPayday.getTime() <= now.getTime()) {
    return currentMonthPayday;
  }

  return createMonthDate(now.getUTCFullYear(), now.getUTCMonth() - 1, salaryDate);
};

const getNextPayday = (now: Date, salaryDate: number) => {
  const currentMonthPayday = createMonthDate(now.getUTCFullYear(), now.getUTCMonth(), salaryDate);
  if (currentMonthPayday.getTime() > now.getTime()) {
    return currentMonthPayday;
  }

  return createMonthDate(now.getUTCFullYear(), now.getUTCMonth() + 1, salaryDate);
};

const wholeDayDiff = (start: Date, end: Date) =>
  Math.max(0, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const getFinancialProfileModel = () =>
  (prisma as unknown as {
    financialProfile?: {
      findUnique: (args: {
        where: { userId: string };
        select: {
          activeIncomeMonthly: true;
          passiveIncomeMonthly: true;
          monthlyIncomeTotal: true;
          monthlyExpenseTotal: true;
        };
      }) => Promise<{
        activeIncomeMonthly: bigint | null;
        passiveIncomeMonthly: bigint | null;
        monthlyIncomeTotal: bigint | null;
        monthlyExpenseTotal: bigint | null;
      } | null>;
    };
  }).financialProfile;

const getAssetModel = () =>
  (prisma as unknown as {
    asset?: {
      findMany: (args: {
        where: { userId: string; assetType: { in: string[] } };
        select: { estimatedValue: true };
      }) => Promise<Array<{ estimatedValue: bigint | null }>>;
    };
  }).asset;

export type CashflowForecastHorizon = "PAYDAY" | "MONTH_END" | "NEXT_7_DAYS";
export type CashflowForecastMode = "SAFETY" | "REMAINING";

export type CashflowForecastQuery = {
  horizon: CashflowForecastHorizon;
  mode: CashflowForecastMode;
};

const PAYDAY_TERMS = [
  "gajian",
  "gaji lagi",
  "tanggal gajian",
  "tgl gajian",
  "payday",
  "gaji berikutnya"
];

const MONTH_END_TERMS = [
  "akhir bulan",
  "ujung bulan",
  "sampai bulan habis",
  "sampe bulan habis",
  "sampai bulan kelar",
  "sampe bulan kelar",
  "sampai bulan ganti",
  "sampe bulan ganti",
  "end of month",
  "bulan ini kelar"
];

const NEXT_WEEK_TERMS = [
  "minggu depan",
  "pekan depan",
  "7 hari ke depan",
  "7 hari lagi",
  "sepekan ke depan",
  "seminggu ke depan",
  "satu minggu ke depan"
];

const SAFETY_TERMS = [
  "aman",
  "cukup",
  "kuat",
  "survive",
  "bertahan",
  "tekor",
  "minus",
  "boncos",
  "nombok",
  "seret",
  "habis sebelum"
];

const REMAINING_TERMS = [
  "sisa berapa",
  "sisa uang",
  "tinggal berapa",
  "masih ada berapa",
  "remain",
  "remaining",
  "kira kira sisa",
  "estimasi sisa"
];

export const parseCashflowForecastQuery = (rawText: string): CashflowForecastQuery | null => {
  const text = normalizeText(rawText);
  if (!text) return null;

  const horizon: CashflowForecastHorizon | null = hasAnyPhrase(text, PAYDAY_TERMS)
    ? "PAYDAY"
    : hasAnyPhrase(text, MONTH_END_TERMS)
      ? "MONTH_END"
      : hasAnyPhrase(text, NEXT_WEEK_TERMS)
        ? "NEXT_7_DAYS"
        : null;

  if (!horizon) return null;

  const mode: CashflowForecastMode = hasAnyPhrase(text, REMAINING_TERMS) ? "REMAINING" : "SAFETY";
  const looksLikeForecast =
    hasAnyPhrase(text, SAFETY_TERMS) ||
    hasAnyPhrase(text, REMAINING_TERMS) ||
    /\b(gimana|gmn|berapa|ga|gak|nggak|tidak)\b/i.test(text) ||
    /\b(kalau pola sekarang|dengan pola sekarang|kalau begini terus)\b/i.test(text);

  if (!looksLikeForecast) return null;

  return { horizon, mode };
};

const buildHorizonLabel = (horizon: CashflowForecastHorizon, targetDate: Date) => {
  if (horizon === "PAYDAY") {
    return `sampai gajian berikutnya pada ${DATE_LABEL_FORMATTER.format(targetDate)}`;
  }
  if (horizon === "NEXT_7_DAYS") {
    return `untuk 7 hari ke depan sampai ${DATE_LABEL_FORMATTER.format(targetDate)}`;
  }
  return `sampai akhir bulan pada ${DATE_LABEL_FORMATTER.format(targetDate)}`;
};

const pickExpenseRunRate = (params: {
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

export const buildCashflowForecastReply = async (params: {
  userId: string;
  query: CashflowForecastQuery;
  now?: Date;
}) => {
  const now = params.now ?? new Date();
  const financialProfileModel = getFinancialProfileModel();
  const assetModel = getAssetModel();

  const [user, profile, liquidAssets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        salaryDate: true
      }
    }),
    financialProfileModel?.findUnique({
      where: { userId: params.userId },
      select: {
        activeIncomeMonthly: true,
        passiveIncomeMonthly: true,
        monthlyIncomeTotal: true,
        monthlyExpenseTotal: true
      }
    }) ?? Promise.resolve(null),
    assetModel?.findMany({
      where: {
        userId: params.userId,
        assetType: {
          in: ["CASH", "SAVINGS"]
        }
      },
      select: {
        estimatedValue: true
      }
    }) ?? Promise.resolve([])
  ]);

  if (!user) {
    return "Data user belum ditemukan, jadi saya belum bisa hitung cashflow kamu.";
  }

  if (params.query.horizon === "PAYDAY" && !user.salaryDate) {
    return "Saya belum bisa hitung sampai gajian karena tanggal gajian kamu belum ada. Isi dulu tanggal gajian, misalnya: tanggal gajian 25.";
  }

  const salaryDate = user.salaryDate ?? null;
  const cycleStart = salaryDate ? getLastPayday(now, salaryDate) : startOfMonth(now);
  const targetDate =
    params.query.horizon === "PAYDAY" && salaryDate
      ? getNextPayday(now, salaryDate)
      : params.query.horizon === "NEXT_7_DAYS"
        ? new Date(now.getTime() + 7 * DAY_MS)
        : endOfMonth(now);

  const rollingExpenseStart = new Date(now.getTime() - 29 * DAY_MS);
  const [cycleTransactions, rollingExpenses] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId: params.userId,
        occurredAt: {
          gte: cycleStart,
          lte: now
        }
      },
      orderBy: { occurredAt: "asc" }
    }),
    prisma.transaction.findMany({
      where: {
        userId: params.userId,
        type: "EXPENSE",
        occurredAt: {
          gte: rollingExpenseStart,
          lte: now
        }
      },
      orderBy: { occurredAt: "asc" }
    })
  ]);

  const cycleIncomeRecorded = cycleTransactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const cycleExpense = cycleTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const rollingExpense = rollingExpenses.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const liquidAssetValue = liquidAssets.reduce((sum, asset) => sum + toNumber(asset.estimatedValue), 0);

  const activeIncomeMonthly = toNumber(profile?.activeIncomeMonthly ?? 0);
  const passiveIncomeMonthly = toNumber(profile?.passiveIncomeMonthly ?? 0);
  const monthlyIncomeProfile = toNumber(profile?.monthlyIncomeTotal ?? 0);
  const monthlyExpenseProfile = toNumber(profile?.monthlyExpenseTotal ?? 0);

  const daysInCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const cycleDays = Math.max(1, wholeDayDiff(cycleStart, now) + 1);
  const daysRemaining = Math.max(0, wholeDayDiff(now, targetDate));
  const rollingDays = Math.max(1, wholeDayDiff(rollingExpenseStart, now) + 1);

  const currentIncomeEstimate =
    cycleIncomeRecorded > 0
      ? cycleIncomeRecorded
      : salaryDate && (activeIncomeMonthly > 0 || monthlyIncomeProfile > 0)
        ? activeIncomeMonthly || monthlyIncomeProfile
        : 0;
  const currentIncomeSource =
    cycleIncomeRecorded > 0 ? "transaksi tercatat" : currentIncomeEstimate > 0 ? "estimasi profil" : "belum ada";

  const passiveIncomeProjected =
    passiveIncomeMonthly > 0 ? Math.round((passiveIncomeMonthly / daysInCurrentMonth) * daysRemaining) : 0;
  const scheduledIncomeBeforeTarget =
    salaryDate &&
    activeIncomeMonthly > 0 &&
    params.query.horizon !== "PAYDAY" &&
    getNextPayday(now, salaryDate).getTime() <= targetDate.getTime()
      ? activeIncomeMonthly
      : 0;

  const expenseRunRate = pickExpenseRunRate({
    cycleExpense,
    cycleDays,
    rollingExpense,
    rollingDays,
    monthlyExpenseProfile,
    daysInMonth: daysInCurrentMonth
  });

  if (expenseRunRate.value <= 0 && cycleExpense <= 0 && monthlyExpenseProfile <= 0) {
    return "Data pengeluaran kamu belum cukup untuk saya proyeksikan. Catat dulu beberapa transaksi atau isi profil pengeluaran bulanan ya Boss.";
  }

  const bufferNow = currentIncomeEstimate - cycleExpense + liquidAssetValue;
  const projectedExpenseUntilTarget = Math.round(expenseRunRate.value * daysRemaining);
  const projectedEndingBalance =
    bufferNow + scheduledIncomeBeforeTarget + passiveIncomeProjected - projectedExpenseUntilTarget;
  const horizonLabel = buildHorizonLabel(params.query.horizon, targetDate);
  const basisStartLabel = DATE_LABEL_FORMATTER.format(cycleStart);
  const basisEndLabel = DATE_LABEL_FORMATTER.format(now);

  const headline =
    params.query.mode === "REMAINING"
      ? `Estimasi sisa cashflow ${horizonLabel} sekitar ${formatMoney(projectedEndingBalance)}.`
      : projectedEndingBalance >= 0
        ? `Secara estimasi kamu masih aman ${horizonLabel}.`
        : `Dengan pola sekarang kamu berisiko minus ${horizonLabel}.`;

  return [
    headline,
    `- Basis transaksi: ${basisStartLabel} s.d. ${basisEndLabel}`,
    `- Income berjalan: ${formatMoney(currentIncomeEstimate)} (${currentIncomeSource})`,
    `- Expense berjalan: ${formatMoney(cycleExpense)}`,
    liquidAssetValue > 0 ? `- Aset likuid tercatat: ${formatMoney(liquidAssetValue)}` : null,
    scheduledIncomeBeforeTarget > 0
      ? `- Income aktif yang diperkirakan masih masuk sebelum target: ${formatMoney(scheduledIncomeBeforeTarget)}`
      : null,
    passiveIncomeProjected > 0
      ? `- Estimasi passive income sampai target: ${formatMoney(passiveIncomeProjected)}`
      : null,
    `- Buffer saat ini: ${formatMoney(bufferNow)}`,
    `- Rata-rata expense harian: ${formatMoney(Math.round(expenseRunRate.value))} (${expenseRunRate.source})`,
    `- Perkiraan kebutuhan sampai target: ${formatMoney(projectedExpenseUntilTarget)}`,
    `- Estimasi posisi di ${DATE_LABEL_FORMATTER.format(targetDate)}: ${formatMoney(projectedEndingBalance)}`,
    "Catatan: ini estimasi dari transaksi dan profil yang tercatat, bukan saldo rekening real."
  ]
    .filter(Boolean)
    .join("\n");
};
