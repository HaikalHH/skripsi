const normalizeAmountInput = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^rp\.?\s*/i, "")
    .replace(/\s*(?:\/\s*bulan|per\s*bulan|\/\s*bln|per\s*bln)\s*$/i, "")
    .trim();

const parseLocalizedNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasComma = trimmed.includes(",");
  const dotCount = (trimmed.match(/\./g) ?? []).length;

  let normalized = trimmed;
  if (hasComma && dotCount > 0) {
    // Indonesian-style thousand/decimal mix: 1.500,5 -> 1500.5
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

export const parsePositiveAmount = (raw: string): number | null => {
  const normalized = normalizeAmountInput(raw);
  if (!normalized) return null;

  const unitMatch = normalized.match(/^([\d.,]+)\s*(jt|juta|rb|ribu|k)$/i);
  if (unitMatch) {
    const numericValue = parseLocalizedNumber(unitMatch[1]);
    if (!numericValue) return null;

    const unit = unitMatch[2].toLowerCase();
    const multiplier = unit === "jt" || unit === "juta" ? 1_000_000 : 1_000;
    return Math.round(numericValue * multiplier);
  }

  const digitsOnly = normalized.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;
  const amount = Number(digitsOnly);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};
