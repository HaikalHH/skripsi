export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;
