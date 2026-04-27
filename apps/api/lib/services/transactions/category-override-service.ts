const EXPENSE_BUCKET_ALIASES: Array<[string, string]> = [
  ["food & drink", "Food & Drink"],
  ["makan", "Food & Drink"],
  ["food", "Food & Drink"],
  ["minum", "Food & Drink"],
  ["kopi", "Food & Drink"],
  ["ngopi", "Food & Drink"],
  ["restoran", "Food & Drink"],
  ["resto", "Food & Drink"],
  ["groceries", "Food & Drink"],
  ["grocery", "Food & Drink"],
  ["sembako", "Food & Drink"],
  ["dapur", "Food & Drink"],
  ["belanja dapur", "Food & Drink"],
  ["sayur", "Food & Drink"],
  ["buah", "Food & Drink"],
  ["beras", "Food & Drink"],
  ["lauk", "Food & Drink"],
  ["snack", "Food & Drink"],
  ["transport", "Transport"],
  ["transportation", "Transport"],
  ["transportasi", "Transport"],
  ["bensin", "Transport"],
  ["bbm", "Transport"],
  ["parkir", "Transport"],
  ["tol", "Transport"],
  ["ojek", "Transport"],
  ["ojol", "Transport"],
  ["gojek", "Transport"],
  ["grab", "Transport"],
  ["taxi", "Transport"],
  ["taksi", "Transport"],
  ["kereta", "Transport"],
  ["krl", "Transport"],
  ["mrt", "Transport"],
  ["lrt", "Transport"],
  ["bus", "Transport"],
  ["transjakarta", "Transport"],
  ["bills", "Bills"],
  ["tagihan", "Bills"],
  ["listrik", "Bills"],
  ["air", "Bills"],
  ["internet", "Bills"],
  ["bpjs", "Bills"],
  ["wifi", "Bills"],
  ["pulsa", "Bills"],
  ["token", "Bills"],
  ["cicilan", "Bills"],
  ["kredit", "Bills"],
  ["sewa", "Bills"],
  ["asuransi", "Bills"],
  ["pajak", "Bills"],
  ["tax", "Bills"],
  ["kesehatan", "Bills"],
  ["health", "Bills"],
  ["medical", "Bills"],
  ["dokter", "Bills"],
  ["klinik", "Bills"],
  ["rumah sakit", "Bills"],
  ["apotek", "Bills"],
  ["obat", "Bills"],
  ["pendidikan", "Bills"],
  ["education", "Bills"],
  ["sekolah", "Bills"],
  ["kuliah", "Bills"],
  ["kampus", "Bills"],
  ["spp", "Bills"],
  ["les", "Bills"],
  ["kursus", "Bills"],
  ["tuition", "Bills"],
  ["entertainment", "Entertainment"],
  ["hiburan", "Entertainment"],
  ["nongkrong", "Entertainment"],
  ["game", "Entertainment"],
  ["gaming", "Entertainment"],
  ["netflix", "Entertainment"],
  ["spotify premium", "Entertainment"],
  ["spotify", "Entertainment"],
  ["youtube premium", "Entertainment"],
  ["steam", "Entertainment"],
  ["bioskop", "Entertainment"],
  ["konser", "Entertainment"],
  ["hobi", "Entertainment"],
  ["liburan", "Entertainment"],
  ["travel", "Entertainment"],
  ["traveling", "Entertainment"],
  ["hotel", "Entertainment"],
  ["tiket", "Entertainment"],
  ["pesawat", "Entertainment"],
  ["staycation", "Entertainment"],
  ["others", "Others"],
  ["other", "Others"],
  ["belanja", "Others"],
  ["shopping", "Others"],
  ["fashion", "Others"],
  ["pakaian", "Others"],
  ["baju", "Others"],
  ["skincare", "Others"],
  ["kosmetik", "Others"],
  ["elektronik", "Others"],
  ["gadget", "Others"],
  ["kebutuhan rumah", "Others"],
  ["keluarga", "Others"],
  ["istri", "Others"],
  ["suami", "Others"],
  ["anak", "Others"],
  ["ortu", "Others"],
  ["orang tua", "Others"],
  ["rumah tangga", "Others"],
  ["kebersihan", "Others"],
  ["perabot", "Others"],
  ["furnitur", "Others"],
  ["donasi", "Others"],
  ["zakat", "Others"],
  ["amal", "Others"],
  ["sedekah", "Others"],
  ["pet", "Others"],
  ["hewan", "Others"],
  ["kucing", "Others"],
  ["anjing", "Others"],
  ["hadiah", "Others"],
  ["gift", "Others"]
];

const INCOME_CATEGORY_ALIASES: Record<string, string> = {
  gaji: "Salary",
  salary: "Salary",
  payroll: "Salary",
  bonus: "Bonus",
  thr: "Bonus",
  insentif: "Bonus",
  komisi: "Bonus",
  freelance: "Freelance",
  freelancer: "Freelance",
  project: "Freelance",
  proyek: "Freelance",
  client: "Freelance",
  nabung: "Savings",
  tabungan: "Savings",
  saving: "Savings",
  pemasukan: "Other Income",
  pendapatan: "Other Income",
  income: "Other Income",
  "transfer masuk": "Other Income"
};

type CategoryOverrideResult = {
  cleanedText: string;
  forcedCategory: string | null;
};

export type ExpenseBucketMatch = {
  alias: string;
  bucket: string;
  index: number;
};

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const toCategoryName = (raw: string) => {
  const normalized = normalizeSpaces(raw).toLowerCase();
  const alias = EXPENSE_BUCKET_ALIASES.find(([aliasKey]) => aliasKey === normalized)?.[1];
  if (alias) return alias;

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const matchIncomeAliasCategory = (raw: string, aliasMap: Record<string, string>) => {
  const normalized = normalizeSpaces(raw).toLowerCase();
  if (!normalized) return null;
  if (aliasMap[normalized]) return aliasMap[normalized];

  let bestMatch: { value: string; keyLength: number } | null = null;
  for (const [aliasKey, aliasValue] of Object.entries(aliasMap)) {
    if (!normalized.includes(aliasKey)) continue;
    if (!bestMatch || aliasKey.length > bestMatch.keyLength) {
      bestMatch = {
        value: aliasValue,
        keyLength: aliasKey.length
      };
    }
  }

  return bestMatch?.value ?? null;
};

const getAliasPosition = (value: string, alias: string) => {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\b)${escapedAlias}(?:\\b|$)`, "i").exec(value);
  return match?.index ?? -1;
};

export const detectExpenseBucketMatches = (raw: string): ExpenseBucketMatch[] => {
  const normalized = normalizeSpaces(raw).toLowerCase();
  if (!normalized) return [];

  return EXPENSE_BUCKET_ALIASES.map(([alias, bucket]) => ({
    alias,
    bucket,
    index: getAliasPosition(normalized, alias)
  }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => {
      if (left.index !== right.index) return left.index - right.index;
      return right.alias.length - left.alias.length;
    });
};

export const detectExpenseBucketCategory = (raw: string) => {
  const matches = detectExpenseBucketMatches(raw);
  return matches[0]?.bucket ?? null;
};

export const normalizeExpenseBucketCategory = (raw: string) =>
  detectExpenseBucketCategory(raw) ?? "Others";

export const normalizeForcedCategory = (raw: string) => normalizeExpenseBucketCategory(raw);

export const normalizeTransactionCategory = (params: {
  type: "INCOME" | "EXPENSE" | "SAVING";
  category: string;
  merchant?: string | null;
  rawText?: string | null;
}) => {
  if (params.type === "SAVING") {
    return "Tabungan";
  }

  const candidates = [params.category, params.merchant ?? "", params.rawText ?? ""].filter(Boolean);
  if (params.type === "EXPENSE") {
    for (const candidate of candidates) {
      const matched = detectExpenseBucketCategory(candidate);
      if (matched) return matched;
    }
    return "Others";
  }

  for (const candidate of candidates) {
    const matched = matchIncomeAliasCategory(candidate, INCOME_CATEGORY_ALIASES);
    if (matched) return matched;
  }

  if (params.type === "INCOME") {
    const normalized = normalizeSpaces(params.category);
    return normalized || "Other Income";
  }

  return "Other Income";
};

export const extractForcedCategory = (rawText: string): CategoryOverrideResult => {
  const text = normalizeSpaces(rawText);
  const match = text.match(/\b(?:kategori|category)\s+([a-z0-9/& -]{2,40})$/i);
  if (!match) {
    return { cleanedText: text, forcedCategory: null };
  }

  const forcedCategory = normalizeForcedCategory(match[1]);
  const cleanedText = normalizeSpaces(text.slice(0, match.index ?? text.length));
  return {
    cleanedText: cleanedText || text,
    forcedCategory
  };
};
