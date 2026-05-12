import {
  EMOJI_ANALYTICS,
  EMOJI_FINANCE,
  EMOJI_GUIDE,
  EMOJI_NOTE,
  EMOJI_SUCCESS,
  EMOJI_TARGET,
  EMOJI_WARNING
} from "./constants";

const EMOJI_RULES: Array<{ emoji: string; patterns: RegExp[] }> = [
  {
    emoji: EMOJI_WARNING,
    patterns: [
      /\b(warning|peringatan|risiko|bahaya|minus|tipis|gagal|gangguan|jatuh tempo|terlalu banyak)\b/i,
      /\b(belum cukup|belum bisa|tidak cukup|ga cukup|gak cukup|melewati|over budget)\b/i
    ]
  },
  {
    emoji: EMOJI_SUCCESS,
    patterns: [
      /\b(berhasil|sukses|aktif|selesai|tercatat|dikonfirmasi|sudah sesuai|sip boss|sip|oke|ok)\b/i
    ]
  },
  {
    emoji: EMOJI_ANALYTICS,
    patterns: [/\b(report|laporan|ringkasan|review|analisa|analisis|insight|forecast|proyeksi|portfolio|portofolio)\b/i]
  },
  {
    emoji: EMOJI_TARGET,
    patterns: [
      /\b(target(?:nya)?|tujuan(?:nya)?|goal|financial freedom|dana darurat|rencana|planner|alokasi|prioritas)\b/i,
      /\b(rumah|kendaraan|mobil|motor|liburan|nikah|properti|tanah|apartemen)\b/i
    ]
  },
  {
    emoji: EMOJI_FINANCE,
    patterns: [/\b(uang|cashflow|budget|pengeluaran|pemasukan|transaksi|bayar|pembayaran|tagihan|saldo|aset|tabungan|cicilan)\b/i]
  },
  {
    emoji: EMOJI_GUIDE,
    patterns: [/\b(help|bantuan|cara|gunakan|pakai|pilih|pilihan|isi|balas|kirim|nomor|jawab|langkah)\b/i]
  }
];

export const pickContextualEmoji = (text: string) => {
  const match = EMOJI_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  return match?.emoji ?? EMOJI_NOTE;
};
