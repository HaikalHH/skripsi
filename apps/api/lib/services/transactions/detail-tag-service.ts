import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category-override-service";
import { normalizeDetectedMerchant, normalizeMerchantName } from "@/lib/services/transactions/merchant-normalization-service";

type DetailTagRule = {
  bucket: string;
  tag: string;
  patterns: RegExp[];
};

const DETAIL_TAG_RULES: DetailTagRule[] = [
  {
    bucket: "Food & Drink",
    tag: "Coffee",
    patterns: [/\bkopi\b/i, /\bcoffee\b/i, /\bngopi\b/i, /\bstarbucks\b/i, /\bkenangan\b/i]
  },
  {
    bucket: "Food & Drink",
    tag: "Meals",
    patterns: [/\bmakan\b/i, /\blunch\b/i, /\bdinner\b/i, /\bresto\b/i, /\brestoran\b/i]
  },
  {
    bucket: "Food & Drink",
    tag: "Groceries",
    patterns: [/\bsembako\b/i, /\bgrocer(?:y|ies)\b/i, /\bdapur\b/i, /\bberas\b/i, /\bsayur\b/i]
  },
  {
    bucket: "Transport",
    tag: "Fuel",
    patterns: [/\bbensin\b/i, /\bbbm\b/i, /\bshell\b/i, /\bpertamina\b/i]
  },
  {
    bucket: "Transport",
    tag: "Parking",
    patterns: [/\bparkir\b/i]
  },
  {
    bucket: "Transport",
    tag: "Toll",
    patterns: [/\btol\b/i]
  },
  {
    bucket: "Transport",
    tag: "Ride Hailing",
    patterns: [/\bgojek\b/i, /\bgrab\b/i, /\bojol\b/i, /\boj[eo]k\b/i]
  },
  {
    bucket: "Transport",
    tag: "Public Transport",
    patterns: [/\bkrl\b/i, /\bmrt\b/i, /\blrt\b/i, /\bkereta\b/i, /\bbus\b/i, /\btransjakarta\b/i]
  },
  {
    bucket: "Bills",
    tag: "Electricity",
    patterns: [/\bpln\b/i, /\blistrik\b/i, /\btoken listrik\b/i]
  },
  {
    bucket: "Bills",
    tag: "Water",
    patterns: [/\bair\b/i, /\bpdam\b/i]
  },
  {
    bucket: "Bills",
    tag: "Internet",
    patterns: [/\binternet\b/i, /\bwifi\b/i, /\bbiznet\b/i, /\bindihome\b/i, /\bmyrepublic\b/i, /\bfirst media\b/i]
  },
  {
    bucket: "Bills",
    tag: "Phone Credit",
    patterns: [/\bpulsa\b/i, /\bpaket data\b/i, /\btelkomsel\b/i, /\bindosat\b/i, /\bxl\b/i, /\btri\b/i]
  },
  {
    bucket: "Bills",
    tag: "Installment",
    patterns: [/\bcicilan\b/i, /\bkredit\b/i, /\bangsuran\b/i]
  },
  {
    bucket: "Bills",
    tag: "Insurance",
    patterns: [/\bbpjs\b/i, /\basuransi\b/i]
  },
  {
    bucket: "Bills",
    tag: "Healthcare",
    patterns: [/\bdokter\b/i, /\bklinik\b/i, /\brumah sakit\b/i, /\bapotek\b/i, /\bobat\b/i]
  },
  {
    bucket: "Bills",
    tag: "Education",
    patterns: [/\bsekolah\b/i, /\bkuliah\b/i, /\bspp\b/i, /\bles\b/i, /\bkursus\b/i]
  },
  {
    bucket: "Entertainment",
    tag: "Spotify",
    patterns: [/\bspotify\b/i]
  },
  {
    bucket: "Entertainment",
    tag: "Netflix",
    patterns: [/\bnetflix\b/i]
  },
  {
    bucket: "Entertainment",
    tag: "YouTube Premium",
    patterns: [/\byoutube premium\b/i, /\byt premium\b/i]
  },
  {
    bucket: "Entertainment",
    tag: "Gaming",
    patterns: [/\bsteam\b/i, /\bgame\b/i, /\bgaming\b/i, /\bpsn\b/i, /\bplaystation\b/i]
  },
  {
    bucket: "Entertainment",
    tag: "Cinema",
    patterns: [/\bbioskop\b/i, /\bcinema\b/i]
  },
  {
    bucket: "Entertainment",
    tag: "Concert",
    patterns: [/\bkonser\b/i]
  },
  {
    bucket: "Entertainment",
    tag: "Travel",
    patterns: [/\bliburan\b/i, /\btravel\b/i, /\bhotel\b/i, /\btiket\b/i, /\bpesawat\b/i, /\bstaycation\b/i]
  },
  {
    bucket: "Others",
    tag: "Shopping",
    patterns: [/\bshopee\b/i, /\btokopedia\b/i, /\bbelanja\b/i, /\bshopping\b/i, /\bbaju\b/i, /\bfashion\b/i]
  },
  {
    bucket: "Others",
    tag: "Household",
    patterns: [/\brumah tangga\b/i, /\bkebutuhan rumah\b/i, /\bkebersihan\b/i, /\bperabot\b/i]
  },
  {
    bucket: "Others",
    tag: "Family",
    patterns: [/\bistri\b/i, /\bsuami\b/i, /\banak\b/i, /\bortu\b/i, /\borang tua\b/i, /\bkeluarga\b/i]
  },
  {
    bucket: "Others",
    tag: "Donation",
    patterns: [/\bdonasi\b/i, /\bzakat\b/i, /\bsedekah\b/i, /\bamal\b/i]
  }
];

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const buildCandidateText = (params: {
  category?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) =>
  normalizeSpaces(
    [params.category ?? "", params.merchant ?? "", params.note ?? "", params.rawText ?? ""]
      .filter(Boolean)
      .join(" ")
  );

const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const sanitizeFallbackTag = (value: string) =>
  normalizeSpaces(
    value
      .replace(/(?:rp\.?\s*)?\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?/gi, " ")
      .replace(/[|/_,()+.-]+/g, " ")
      .replace(/\b(?:bayar|beli|belanja|transfer|top up|topup|untuk|yang|bulan|minggu|hari|ini|tadi|kemarin)\b/gi, " ")
  );

export const inferTransactionDetailTag = (params: {
  type: "INCOME" | "EXPENSE";
  category?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) => {
  const merchant = normalizeMerchantName(params.merchant ?? null);
  if (params.type === "INCOME") {
    return merchant ?? (params.category ? titleCase(normalizeSpaces(params.category)) : null);
  }

  const bucket = normalizeExpenseBucketCategory(params.category ?? params.rawText ?? params.merchant ?? "Others");
  const candidateText = buildCandidateText(params);
  const canonicalMerchant = normalizeDetectedMerchant({
    merchant: params.merchant ?? null,
    rawText: [params.note ?? "", params.rawText ?? ""].filter(Boolean).join(" ")
  });

  for (const rule of DETAIL_TAG_RULES) {
    if (rule.bucket !== bucket) continue;
    if (rule.patterns.some((pattern) => pattern.test(candidateText))) {
      return rule.tag;
    }
  }

  if (canonicalMerchant) {
    return canonicalMerchant;
  }

  const fallbackText = sanitizeFallbackTag(params.note ?? params.rawText ?? "");
  if (!fallbackText) return null;

  const firstMeaningfulChunk = fallbackText
    .split(/\s+/)
    .filter((part) => part.length >= 3)
    .slice(0, 3)
    .join(" ");

  return firstMeaningfulChunk ? titleCase(firstMeaningfulChunk) : null;
};

export const buildTransactionDetailLabel = (params: {
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) =>
  (() => {
    const normalizedMerchant =
      normalizeDetectedMerchant({
        merchant: params.merchant ?? null,
        rawText: [params.note ?? "", params.rawText ?? ""].filter(Boolean).join(" ")
      }) ?? params.merchant;
    if (
      normalizedMerchant &&
      params.detailTag &&
      normalizedMerchant.toLowerCase() !== params.detailTag.toLowerCase()
    ) {
      return normalizedMerchant;
    }

    return params.detailTag ?? normalizedMerchant;
  })() ??
  params.note ??
  params.rawText ??
  "Tanpa keterangan";
