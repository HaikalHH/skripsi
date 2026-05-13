import type { ReportPeriod } from "@finance/shared";

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: "hari ini",
  weekly: "minggu ini",
  monthly: "bulan ini"
};

export const includesAnyPhrase = (text: string, phrases: string[]) =>
  phrases.some((phrase) => text.includes(phrase));

export const includesAllPhraseGroups = (text: string, groups: string[][]) =>
  groups.every((group) => includesAnyPhrase(text, group));

export const LIST_TERMS = [
  "detail",
  "rincian",
  "daftar",
  "list",
  "apa aja",
  "apa saja",
  "isi",
  "liat",
  "lihat"
];

export const TOTAL_TERMS = [
  "total",
  "jumlah",
  "berapa",
  "habis berapa",
  "keluar berapa",
  "spending berapa",
  "nominal berapa"
];

export const TOP_TERMS = [
  "terbesar",
  "paling besar",
  "paling gede",
  "paling tinggi",
  "top",
  "paling mahal",
  "termahal"
];

export const COUNT_TERMS = [
  "berapa kali",
  "berapa transaksi",
  "jumlah transaksi",
  "count",
  "frekuensi",
  "seberapa sering"
];

export const SHARE_TERMS = [
  "kontribusi",
  "persen",
  "percentage",
  "proporsi",
  "porsi",
  "share",
  "nyumbang",
  "sumbang"
];

export const AVERAGE_TERMS = ["rata-rata", "rata rata", "average", "rerata", "biasanya berapa", "normalnya berapa"];
export const WEEKLY_TERMS = ["per minggu", "mingguan", "weekly", "tiap minggu", "sepekan"];
export const MONTHLY_TERMS = ["per bulan", "bulanan", "monthly", "tiap bulan", "sebulan"];
export const MERCHANT_TERMS = ["merchant", "toko", "tempat", "vendor"];
export const COUNT_FOCUS_TERMS = [
  "paling sering",
  "tersering",
  "paling rutin",
  "rutin",
  "muncul terus",
  "muncul paling sering",
  "paling sering nongol",
  "yang paling sering kepake",
  "kepake paling sering",
  "frekuensi tertinggi"
];
export const AMOUNT_FOCUS_TERMS = [...TOP_TERMS, "paling boncos", "paling banyak"];
export const COMPARE_TERMS = ["dibanding", "bandingkan", "bandingin", "vs", "versus", "ketimbang"];
export const PREVIOUS_PERIOD_TERMS = [
  "lalu",
  "sebelumnya",
  "kemarin",
  "periode lalu",
  "bulan lalu",
  "minggu lalu",
  "hari lalu"
];
export const CHANGE_TERMS = ["naik", "turun", "melonjak", "drop", "membengkak", "ngebengkak", "lonjak"];
export const EXPLAIN_TERMS = [
  "kenapa",
  "apa yang bikin",
  "yang bikin",
  "penyebab",
  "gara gara",
  "gara-gara",
  "yang dorong",
  "ngedorong",
  "pemicu"
];
export const RECURRING_TERMS = [
  "recurring",
  "rutin",
  "berulang",
  "langganan",
  "langganan aktif",
  "tagihan rutin"
];
export const NEW_ENTRY_TERMS = ["baru", "new", "belum pernah", "muncul baru", "muncul pertama", "pertama kali"];
export const WEEKEND_TERMS = ["weekend", "akhir pekan", "sabtu minggu", "sabtu", "minggu"];
export const WEEKDAY_TERMS = ["weekday", "hari kerja", "weekdays"];
export const LEAK_TERMS = [
  "bocor halus",
  "kebocoran halus",
  "leak",
  "leaks",
  "kebiasaan bocor",
  "bocor kecil",
  "receh tapi sering",
  "pengeluaran receh tapi sering",
  "kebiasaan boros",
  "boros halus",
  "bikin bocor"
];

export const GENERIC_BUCKET_TERMS = new Set([
  "food & drink",
  "food",
  "makan",
  "minum",
  "transport",
  "transportation",
  "transportasi",
  "bills",
  "tagihan",
  "entertainment",
  "hiburan",
  "others",
  "other"
]);

export const MONTH_ALIASES = [
  { month: 0, aliases: ["januari", "jan", "january"] },
  { month: 1, aliases: ["februari", "feb", "february"] },
  { month: 2, aliases: ["maret", "mar", "march"] },
  { month: 3, aliases: ["april", "apr"] },
  { month: 4, aliases: ["mei", "may"] },
  { month: 5, aliases: ["juni", "jun", "june"] },
  { month: 6, aliases: ["juli", "jul", "july"] },
  { month: 7, aliases: ["agustus", "agu", "agt", "aug", "august"] },
  { month: 8, aliases: ["september", "sep", "sept"] },
  { month: 9, aliases: ["oktober", "okt", "october", "oct"] },
  { month: 10, aliases: ["november", "nov"] },
  { month: 11, aliases: ["desember", "des", "december", "dec"] }
] as const;

export const MONTH_ALIAS_LOOKUP = new Map<string, number>();
for (const entry of MONTH_ALIASES) {
  for (const alias of entry.aliases) {
    MONTH_ALIAS_LOOKUP.set(alias, entry.month);
  }
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const MONTH_NAME_PATTERN = Array.from(MONTH_ALIAS_LOOKUP.keys())
  .sort((left, right) => right.length - left.length)
  .map(escapeRegex)
  .join("|");

