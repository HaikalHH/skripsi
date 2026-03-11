const MERCHANT_ALIAS_PATTERNS: Array<{ canonical: string; patterns: RegExp[] }> = [
  {
    canonical: "Spotify",
    patterns: [/\bspotify\b/i, /\bspotify premium\b/i, /\bspotify family\b/i, /\bspotify duo\b/i]
  },
  {
    canonical: "Netflix",
    patterns: [/\bnetflix\b/i]
  },
  {
    canonical: "YouTube Premium",
    patterns: [/\byoutube premium\b/i, /\byt premium\b/i]
  },
  {
    canonical: "Disney+",
    patterns: [/\bdisney\+?\b/i, /\bdisney plus\b/i]
  },
  {
    canonical: "Prime Video",
    patterns: [/\bprime video\b/i, /\bamazon prime\b/i]
  },
  {
    canonical: "Apple Music",
    patterns: [/\bapple music\b/i]
  },
  {
    canonical: "iCloud",
    patterns: [/\bicloud\b/i]
  },
  {
    canonical: "Google One",
    patterns: [/\bgoogle one\b/i]
  },
  {
    canonical: "ChatGPT",
    patterns: [/\bchatgpt\b/i, /\bopenai\b/i]
  },
  {
    canonical: "Steam",
    patterns: [/\bsteam\b/i, /\bsteam wallet\b/i]
  },
  {
    canonical: "PlayStation",
    patterns: [/\bplaystation\b/i, /\bpsn\b/i, /\bps store\b/i]
  },
  {
    canonical: "Gojek",
    patterns: [/\bgojek\b/i, /\bgo ride\b/i, /\bgo food\b/i]
  },
  {
    canonical: "Grab",
    patterns: [/\bgrab\b/i, /\bgrabfood\b/i, /\bgrab bike\b/i]
  },
  {
    canonical: "Shopee",
    patterns: [/\bshopee\b/i, /\bshopeepay\b/i]
  },
  {
    canonical: "Tokopedia",
    patterns: [/\btokopedia\b/i]
  },
  {
    canonical: "Biznet",
    patterns: [/\bbiznet\b/i]
  },
  {
    canonical: "IndiHome",
    patterns: [/\bindihome\b/i]
  },
  {
    canonical: "MyRepublic",
    patterns: [/\bmyrepublic\b/i]
  },
  {
    canonical: "First Media",
    patterns: [/\bfirst media\b/i]
  },
  {
    canonical: "PLN",
    patterns: [/\bpln\b/i, /\blistrik\b/i, /\btoken listrik\b/i]
  },
  {
    canonical: "BPJS",
    patterns: [/\bbpjs\b/i]
  },
  {
    canonical: "Telkomsel",
    patterns: [/\btelkomsel\b/i, /\bsimpati\b/i, /\bhalo\b/i]
  },
  {
    canonical: "XL",
    patterns: [/\bxl\b/i, /\baxis\b/i]
  },
  {
    canonical: "Indosat",
    patterns: [/\bindosat\b/i, /\bim3\b/i]
  },
  {
    canonical: "Tri",
    patterns: [/\btri\b/i, /\b3\b(?=.*(pulsa|paket|internet))/i]
  },
  {
    canonical: "Alfamart",
    patterns: [/\balfamart\b/i]
  },
  {
    canonical: "Indomaret",
    patterns: [/\bindomaret\b/i]
  }
];

const SUBSCRIPTION_LIKE_MERCHANTS = new Set([
  "Spotify",
  "Netflix",
  "YouTube Premium",
  "Disney+",
  "Prime Video",
  "Apple Music",
  "iCloud",
  "Google One",
  "ChatGPT",
  "Biznet",
  "IndiHome",
  "MyRepublic",
  "First Media",
  "BPJS"
]);

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const cleanRawMerchant = (value: string) =>
  normalizeSpaces(
    value
      .replace(/[|/_,.-]+/g, " ")
      .replace(/\b(?:pte|pt|tbk|ltd|inc|corp|co|indonesia)\b/gi, "")
      .replace(/\b(?:premium|family|duo|monthly|bulanan)\b/gi, "")
  );

const detectCanonicalMerchant = (value: string): string | null => {
  for (const entry of MERCHANT_ALIAS_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(value))) {
      return entry.canonical;
    }
  }
  return null;
};

export const inferMerchantFromText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = normalizeSpaces(value);
  return detectCanonicalMerchant(normalized);
};

export const normalizeMerchantName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = cleanRawMerchant(value);
  if (!normalized) return null;

  const detected = detectCanonicalMerchant(normalized);
  if (detected) return detected;

  if (normalized.length < 3) return null;
  return titleCase(normalized);
};

export const normalizeDetectedMerchant = (params: {
  merchant?: string | null;
  rawText?: string | null;
}) => {
  const fromMerchant = normalizeMerchantName(params.merchant ?? null);
  if (fromMerchant) return fromMerchant;

  const fromRawText = inferMerchantFromText(params.rawText ?? null);
  if (fromRawText) return fromRawText;

  return null;
};

export const isSubscriptionLikeMerchant = (value: string | null | undefined) => {
  const normalized = normalizeMerchantName(value ?? null);
  if (!normalized) return false;
  return SUBSCRIPTION_LIKE_MERCHANTS.has(normalized);
};
