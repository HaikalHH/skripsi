const OUTBOUND_MESSAGE_MAX_LENGTH = 191;

const normalizeMessageText = (value: string) => value.replace(/\s+/g, " ").trim();

export const toSafeOutboundMessageText = (value: string) => {
  const normalized = normalizeMessageText(value);
  if (normalized.length <= OUTBOUND_MESSAGE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, OUTBOUND_MESSAGE_MAX_LENGTH - 3)}...`;
};
