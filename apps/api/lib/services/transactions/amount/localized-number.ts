export const parseLocalizedNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasComma = trimmed.includes(",");
  const dotCount = (trimmed.match(/\./g) ?? []).length;

  let normalized = trimmed;
  if (hasComma && dotCount > 0) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = trimmed.replace(",", ".");
  } else if (dotCount > 1) {
    normalized = trimmed.replace(/\./g, "");
  } else if (dotCount === 1) {
    const [left, right = ""] = trimmed.split(".");
    if (right.length === 3) {
      normalized = `${left}${right}`;
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const isNumericToken = (token: string) => /^[\d.,]+$/.test(token);

export const parseNumericChunk = (token: string) => parseLocalizedNumber(token);
