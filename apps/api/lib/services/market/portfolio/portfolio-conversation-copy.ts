export const GOLD_ADD_INTENT_PATTERN = /\b(?:tambah|beli|catat|punya)\s+emas\b/i;
export const STOCK_ADD_INTENT_PATTERN = /\b(?:tambah|beli|catat|punya)\s+saham\b/i;
export const GOLD_COMMAND_HINT_PATTERN =
  /\b(?:berita|news|harga sekarang|cek harga|price|laporan|portfolio|portofolio|pengeluaran|transaksi|budget|goal|cashflow|alokasi|reminder|saham|diversifikasi)\b/i;
export const GOLD_NON_ANSWER_PATTERN =
  /^(?:ok(?:e|ay)?|sip|siap|lanjut|next|terus|halo|hai|hi|makasih|terima kasih|tolong|bantu)$/i;
export const STOCK_NON_ANSWER_PATTERN =
  /^(?:ok(?:e|ay)?|sip|siap|lanjut|next|terus|halo|hai|hi|makasih|terima kasih|tolong|bantu)$/i;
export const GOLD_TYPE_QUESTION = `Emas kamu jenis apa?

1\uFE0F\u20E3 Batangan (Antam / UBS / dll)
2\uFE0F\u20E3 Perhiasan
3\uFE0F\u20E3 Emas digital`;
export const GOLD_BRAND_QUESTION = `Brand emasnya apa?

1\uFE0F\u20E3 Antam
2\uFE0F\u20E3 UBS
3\uFE0F\u20E3 Galeri24
4\uFE0F\u20E3 Lainnya (sebutkan)`;
export const GOLD_WEIGHT_QUESTION = "Beratnya berapa gram?";
export const GOLD_KARAT_QUESTION = `Karatnya berapa?

1\uFE0F\u20E3 24K
2\uFE0F\u20E3 23K
3\uFE0F\u20E3 22K
4\uFE0F\u20E3 18K
5\uFE0F\u20E3 17K
6\uFE0F\u20E3 Lainnya`;
export const GOLD_DIGITAL_WEIGHT_QUESTION = "Kamu punya berapa gram emas digitalnya?";
export const GOLD_PLATFORM_QUESTION = `Platformnya apa?

1\uFE0F\u20E3 Pegadaian
2\uFE0F\u20E3 Tokopedia Emas
3\uFE0F\u20E3 Shopee Emas
4\uFE0F\u20E3 Lainnya (sebutkan)`;
export const GOLD_PRICE_QUESTION = "Harga saat dicatat berapa?";
export const GOLD_PRICE_MODE_QUESTION = "Itu harga per gram atau total ya?";
export const STOCK_SYMBOL_QUESTION = "Apa kode sahamnya? (contoh: BBRI, TLKM)";
export const STOCK_QUANTITY_QUESTION = `Berapa yang kamu punya?
(bisa jawab dalam lot atau lembar, contoh: 2 lot atau 150 lembar)`;
export const STOCK_PRICE_QUESTION = "Berapa harga per lembar saat dicatat? (dalam Rupiah)";
export const STOCK_CORRECTION_QUESTION =
  "Bagian mana yang ingin dikoreksi? Kode saham, jumlah, atau harga saat dicatat?";
export const STOCK_CONFIRM_QUESTION = "Apakah data ini sudah benar?";
export const STOCK_VALIDATION_UNAVAILABLE_REPLY =
  "Lagi belum bisa validasi kode saham sekarang. Coba lagi sebentar ya.";

