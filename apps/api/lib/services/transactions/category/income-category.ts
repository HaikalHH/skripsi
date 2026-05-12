import { normalizeSpaces } from "../helpers/text";

export const matchIncomeAliasCategory = (raw: string, aliasMap: Record<string, string>) => {
  const normalized = normalizeSpaces(raw).toLowerCase();
  if (!normalized) return null;
  if (aliasMap[normalized]) return aliasMap[normalized];

  let bestMatch: { value: string; keyLength: number } | null = null;
  for (const [aliasKey, aliasValue] of Object.entries(aliasMap)) {
    if (!normalized.includes(aliasKey)) continue;
    if (!bestMatch || aliasKey.length > bestMatch.keyLength) {
      bestMatch = {
        value: aliasValue,
        keyLength: aliasKey.length
      };
    }
  }

  return bestMatch?.value ?? null;
};
