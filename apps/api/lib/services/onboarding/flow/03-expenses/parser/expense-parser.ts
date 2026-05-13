import { OnboardingQuestionKey, type OnboardingSession } from "@prisma/client";
import { extractMoneyFromFreeText, normalizeLooseText } from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";
import type { ExpenseBreakdown } from "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service";
import {
  getSessionNormalizedValue,
  normalizeText,
  type GuidedOtherExpenseAnswer,
  type GuidedOtherExpenseItem,
  type GuidedOtherExpenseStage,
  type SessionAnswerValue
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import { getConfirmedSessions } from "@/lib/services/onboarding/flow/helpers/session-values";

const ONBOARDING_EXPENSE_CATEGORY_MAP: Array<{ key: keyof ExpenseBreakdown; aliases: string[] }> = [
  {
    key: "food",
    aliases: [
      "makan",
      "food",
      "makan minum",
      "minum",
      "jajan",
      "konsumsi",
      "kopi",
      "ngopi",
      "resto",
      "restoran",
      "warung",
      "sarapan",
      "lunch",
      "dinner",
      "snack",
      "cemilan",
      "groceries",
      "grocery",
      "sembako",
      "dapur",
      "sayur",
      "buah",
      "beras",
      "lauk",
      "belanja bulanan",
      "belanja dapur"
    ]
  },
  {
    key: "transport",
    aliases: [
      "transport",
      "transportasi",
      "bensin",
      "bbm",
      "pertalite",
      "pertamax",
      "solar",
      "parkir",
      "tol",
      "ojek",
      "ojol",
      "gojek",
      "grab",
      "taxi",
      "taksi",
      "kereta",
      "krl",
      "mrt",
      "lrt",
      "bus",
      "transjakarta",
      "angkot",
      "commute",
      "komuter",
      "servis motor",
      "servis mobil"
    ]
  },
  {
    key: "bills",
    aliases: [
      "tagihan",
      "bill",
      "bills",
      "listrik",
      "air",
      "internet",
      "wifi",
      "telp",
      "telepon",
      "pulsa",
      "token",
      "pdam",
      "gas",
      "iuran",
      "sewa",
      "kontrakan",
      "kos",
      "kost",
      "cicilan",
      "kredit",
      "angsuran",
      "kartu kredit",
      "cc",
      "asuransi",
      "bpjs",
      "dokter",
      "klinik",
      "rumah sakit",
      "hospital",
      "obat",
      "apotek",
      "medical",
      "kesehatan",
      "health",
      "spp",
      "uang sekolah",
      "sekolah",
      "kuliah",
      "kampus",
      "les",
      "kursus",
      "education",
      "pendidikan",
      "tuition"
    ]
  },
  {
    key: "entertainment",
    aliases: [
      "hiburan",
      "nongkrong",
      "entertainment",
      "hangout",
      "streaming",
      "netflix",
      "spotify",
      "youtube premium",
      "bioskop",
      "cinema",
      "film",
      "movie",
      "game",
      "gaming",
      "steam",
      "playstation",
      "ps",
      "xbox",
      "nonton",
      "konser",
      "rekreasi",
      "liburan",
      "traveling",
      "travel",
      "hobi",
      "hobby"
    ]
  },
  {
    key: "others",
    aliases: [
      "lainnya",
      "lain lain",
      "other",
      "others",
      "keluarga",
      "istri",
      "suami",
      "anak",
      "ortu",
      "orang tua",
      "rumah tangga",
      "kebersihan",
      "donasi",
      "zakat",
      "amal",
      "charity",
      "hadiah",
      "gift",
      "fashion",
      "baju",
      "pakaian",
      "skincare",
      "kosmetik",
      "makeup",
      "pet",
      "hewan",
      "kucing",
      "anjing",
      "misc"
    ]
  }
];

export type ManualExpenseBreakdownDetail = {
  label: string;
  amount: number;
  bucket: keyof ExpenseBreakdown;
};

export type GuidedExpenseState = {
  items: GuidedOtherExpenseItem[];
  total: number;
  stage: GuidedOtherExpenseStage;
  pendingLabel: string | null;
};

const resolveOnboardingExpenseBucket = (rawLabel: string): keyof ExpenseBreakdown => {
  const normalizedLabel = normalizeLooseText(rawLabel);
  const target = ONBOARDING_EXPENSE_CATEGORY_MAP.find((item) =>
    item.aliases.some((alias) => normalizedLabel.includes(alias))
  );
  return target?.key ?? "others";
};

export const parseManualExpenseBreakdownDetails = (
  raw: string
): ManualExpenseBreakdownDetail[] => {
  return raw
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawLabel, rawAmount] = line.split(":");
      const amount = rawAmount
        ? extractMoneyFromFreeText(rawAmount)
        : extractMoneyFromFreeText(line);
      if (amount === null) return null;

      const labelSource = normalizeText(rawLabel ?? line);
      return {
        label: labelSource,
        amount,
        bucket: resolveOnboardingExpenseBucket(labelSource)
      };
    })
    .filter((item): item is ManualExpenseBreakdownDetail => Boolean(item));
};

export const parseManualExpenseBreakdown = (raw: string): ExpenseBreakdown | null => {
  const result: ExpenseBreakdown = {
    food: 0,
    transport: 0,
    bills: 0,
    entertainment: 0,
    others: 0
  };

  const details = parseManualExpenseBreakdownDetails(raw);
  for (const detail of details) {
    result[detail.bucket] += detail.amount;
  }

  const populatedCategories = Object.values(result).filter((value) => value > 0).length;
  if (populatedCategories === 0) {
    return null;
  }

  return result;
};

export const isGuidedOtherExpenseAnswer = (value: unknown): value is GuidedOtherExpenseAnswer => {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const candidate = value as Record<string, unknown>;

  switch (candidate.kind) {
    case "presence":
      return typeof candidate.hasOtherExpense === "boolean";
    case "category_name":
      return typeof candidate.label === "string" && normalizeText(candidate.label).length > 0;
    case "category_amount":
      return (
        typeof candidate.label === "string" &&
        normalizeText(candidate.label).length > 0 &&
        typeof candidate.amount === "number" &&
        Number.isFinite(candidate.amount) &&
        candidate.amount >= 0
      );
    case "add_more":
      return typeof candidate.addMore === "boolean";
    default:
      return false;
  }
};

export const getGuidedOtherExpenseState = (
  sessions: OnboardingSession[]
): GuidedExpenseState => {
  const items: GuidedOtherExpenseItem[] = [];
  let stage: GuidedOtherExpenseStage = "presence";
  let pendingLabel: string | null = null;

  for (const session of getConfirmedSessions(sessions).filter(
    (item) => item.questionKey === OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS
  )) {
    const normalized = getSessionNormalizedValue<SessionAnswerValue>(session);

    if (typeof normalized === "number") {
      if (normalized > 0) {
        items.push({ label: "lainnya", amount: normalized });
      }
      stage = "presence";
      pendingLabel = null;
      continue;
    }

    if (!isGuidedOtherExpenseAnswer(normalized)) {
      continue;
    }

    switch (normalized.kind) {
      case "presence":
        stage = normalized.hasOtherExpense ? "category_name" : "presence";
        pendingLabel = null;
        break;
      case "category_name":
        stage = "category_amount";
        pendingLabel = normalized.label;
        break;
      case "category_amount":
        items.push({
          label: normalized.label,
          amount: normalized.amount
        });
        stage = "add_more";
        pendingLabel = null;
        break;
      case "add_more":
        stage = normalized.addMore ? "category_name" : "presence";
        pendingLabel = null;
        break;
    }
  }

  return {
    items,
    total: items.reduce((sum, item) => sum + item.amount, 0),
    stage,
    pendingLabel
  };
};
