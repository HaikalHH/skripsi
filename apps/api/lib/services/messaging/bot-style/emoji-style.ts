const trimText = (value: string) => value.trim();

export const applyBossFinanceEmojiStyle = (
  text: string,
  _options?: { preserveLeadingMarker?: boolean }
) => {
  return trimText(text);
};
