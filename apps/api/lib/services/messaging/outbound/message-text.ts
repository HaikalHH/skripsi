const OUTBOUND_MESSAGE_MAX_LENGTH = 191;

const removeInvalidSurrogates = (value: string) => {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
    const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;

    if (isHighSurrogate) {
      const nextCode = value.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        result += value[index] + value[index + 1];
        index += 1;
      }
      continue;
    }

    if (isLowSurrogate) continue;
    result += value[index];
  }

  return result;
};

const removeControlCharacters = (value: string) =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const safeSlice = (value: string, maxLength: number) => {
  const sliced = value.slice(0, maxLength);
  const lastCharCode = sliced.charCodeAt(sliced.length - 1);
  return lastCharCode >= 0xd800 && lastCharCode <= 0xdbff ? sliced.slice(0, -1) : sliced;
};

const normalizeMessageText = (value: string) =>
  removeControlCharacters(removeInvalidSurrogates(value)).replace(/\s+/g, " ").trim();

export const toSafeOutboundMessageText = (value: string) => {
  const normalized = normalizeMessageText(value);
  if (normalized.length <= OUTBOUND_MESSAGE_MAX_LENGTH) return normalized;
  return `${safeSlice(normalized, OUTBOUND_MESSAGE_MAX_LENGTH - 3)}...`;
};
