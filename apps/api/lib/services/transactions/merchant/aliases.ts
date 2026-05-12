export const MERCHANT_ALIAS_PATTERNS: Array<{ canonical: string; patterns: RegExp[] }> = [
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

export const RECURRING_LIKE_MERCHANTS = new Set([
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

export const ALIAS_TEXT_STOPWORDS = new Set([
  "bayar",
  "beli",
  "belanja",
  "top",
  "up",
  "topup",
  "transfer",
  "ke",
  "buat",
  "untuk",
  "yang",
  "pakai",
  "pake",
  "via",
  "sebesar",
  "sekitar",
  "langganan",
  "recurring",
  "transaksi",
  "tagihan",
  "token",
  "listrik",
  "internet",
  "bulanan",
  "monthly",
  "mingguan",
  "weekly",
  "hari",
  "ini",
  "kemarin",
  "tadi",
  "rumah",
  "biaya",
  "pengeluaran",
  "expense"
]);
