import {
  EMOJI_NOTE,
  EMOJI_REGEX,
  EMOJI_WARNING,
  IMPORTANT_WARNING_REGEX,
  LEADING_MARKER_LINE_REGEX,
  LIST_PREFIX_REGEX
} from "./constants";
import { pickContextualEmoji } from "./emoji-rules";

const trimText = (value: string) => value.trim();

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

      if (isListItem && /^.+:\s/.test(content)) {
        return null;
      }

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
