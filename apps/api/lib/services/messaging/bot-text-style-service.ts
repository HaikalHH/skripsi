const EMOJI_REGEX = /\p{Extended_Pictographic}/u;
const LEADING_MARKER_LINE_REGEX = /^(Reminder |Review Mingguan|Closing Bulanan)/i;
const LIST_PREFIX_REGEX = /^(\s*(?:[-*]\s+|\d+\.\s+))/;
const EMOJI_NOTE = "\u{1F4CC}";
const EMOJI_SUCCESS = "\u2705";
const EMOJI_WARNING = "\u26A0\uFE0F";
const EMOJI_TARGET = "\u{1F3AF}";
const EMOJI_ANALYTICS = "\u{1F4CA}";
const EMOJI_FINANCE = "\u{1F4B8}";
const EMOJI_GUIDE = "\u{1F4DD}";
const trimText = (value: string) => value.trim();
const IMPORTANT_WARNING_REGEX =
  /\b(warning|peringatan|bahaya|minus|tipis|gagal|gangguan|jatuh tempo|terlalu banyak|tidak cukup|ga cukup|gak cukup|melewati|over budget)\b/i;

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
      /\b(target(?:nya)?|tujuan(?:nya)?|goal|financial freedom|dana darurat|rencana|planner|alokasi|prioritas|progress)\b/i,
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

const pickContextualEmoji = (text: string) => {
  const match = EMOJI_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  return match?.emoji ?? EMOJI_NOTE;
};

const isImportantWarningText = (text: string) => IMPORTANT_WARNING_REGEX.test(text);

const styleLine = (line: string, emoji: string) => {
  if (!line.trim()) return line;
  if (EMOJI_REGEX.test(line)) return line;

  const listPrefixMatch = line.match(LIST_PREFIX_REGEX);
  if (listPrefixMatch) {
    const prefix = listPrefixMatch[1];
    const content = line.slice(prefix.length).trimStart();
    return `${prefix}${emoji} ${content}`;
  }

  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
  const content = line.trimStart();
  return `${leadingWhitespace}${emoji} ${content}`;
};

export const applyBossFinanceEmojiStyle = (
  text: string,
  options?: { preserveLeadingMarker?: boolean }
) => {
  const trimmed = trimText(text);
  if (!trimmed) return trimmed;

  const lines = trimmed.split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentLineIndex < 0) return `${EMOJI_NOTE} ${trimmed}`;

  let preservedMarkerIndex = -1;
  if (
    options?.preserveLeadingMarker &&
    LEADING_MARKER_LINE_REGEX.test(lines[firstContentLineIndex].trim())
  ) {
    preservedMarkerIndex = firstContentLineIndex;
  }

  const existingEmojiLineIndexes = new Set(
    lines
      .map((line, index) => (line.trim() && EMOJI_REGEX.test(line) ? index : -1))
      .filter((index) => index >= 0)
  );

  const candidates = lines
    .map((line, index) => {
      if (index === preservedMarkerIndex || !line.trim() || EMOJI_REGEX.test(line)) {
        return null;
      }

      const isListItem = LIST_PREFIX_REGEX.test(line);
      const content = line.replace(LIST_PREFIX_REGEX, "").trim();
      const emoji = pickContextualEmoji(content);
      return {
        index,
        emoji,
        isWarning: emoji === EMOJI_WARNING,
        isGeneric: emoji === EMOJI_NOTE,
        isListItem,
        isImportantWarning: emoji === EMOJI_WARNING && isImportantWarningText(content)
      };
    })
    .filter(
      (
        item
      ): item is {
        index: number;
        emoji: string;
        isWarning: boolean;
        isGeneric: boolean;
        isListItem: boolean;
        isImportantWarning: boolean;
      } => Boolean(item)
    );

  const linesToStyle = new Set<number>();

  if (existingEmojiLineIndexes.size > 0) {
    const importantWarningCandidate = candidates.find((item) => item.isImportantWarning);
    if (importantWarningCandidate) {
      linesToStyle.add(importantWarningCandidate.index);
    }
  } else {
    const primaryCandidate =
      candidates.find((item) => item.isWarning) ??
      candidates.find((item) => item.isListItem && !item.isGeneric) ??
      candidates.find((item) => !item.isGeneric) ??
      candidates[0] ??
      null;
    if (primaryCandidate) {
      linesToStyle.add(primaryCandidate.index);
    }
  }

  return lines
    .map((line, index) => {
      if (!linesToStyle.has(index)) return line;
      const candidate = candidates.find((item) => item.index === index);
      return candidate ? styleLine(line, candidate.emoji) : line;
    })
    .join("\n");
};

export const styleBotReplyPayload = <
  T extends {
    replyText?: unknown;
    replyTexts?: unknown;
  }
>(
  body: T
): T => {
  const styledReplyText =
    typeof body.replyText === "string" ? applyBossFinanceEmojiStyle(body.replyText) : body.replyText;
  const styledReplyTexts = Array.isArray(body.replyTexts)
    ? body.replyTexts.map((item) =>
        typeof item === "string" ? applyBossFinanceEmojiStyle(item) : item
      )
    : body.replyTexts;

  return {
    ...body,
    replyText: styledReplyText,
    replyTexts: styledReplyTexts
  };
};
