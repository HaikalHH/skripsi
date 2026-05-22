export const STOCK_ADD_INTENT_PATTERN = /\b(?:tambah|beli|catat|punya)\s+saham\b/i;
export const STOCK_NON_ANSWER_PATTERN =
  /^(?:ok(?:e|ay)?|sip|siap|lanjut|next|terus|halo|hai|hi|makasih|terima kasih|tolong|bantu)$/i;
export const STOCK_SYMBOL_QUESTION = "Apa kode sahamnya? (contoh: BBRI, TLKM)";
export const STOCK_QUANTITY_QUESTION = `Berapa yang kamu punya?
(bisa jawab dalam lot atau lembar, contoh: 2 lot atau 150 lembar)`;
export const STOCK_PRICE_QUESTION = "Berapa harga per lembar saat dicatat? (dalam Rupiah)";
export const STOCK_CORRECTION_QUESTION =
  "Bagian mana yang ingin dikoreksi? Kode saham, jumlah, atau harga saat dicatat?";
export const STOCK_CONFIRM_QUESTION = "Apakah data ini sudah benar?";
export const STOCK_VALIDATION_UNAVAILABLE_REPLY =
  "Lagi belum bisa validasi kode saham sekarang. Coba lagi sebentar ya.";
