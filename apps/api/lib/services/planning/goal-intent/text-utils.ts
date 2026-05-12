export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

export const titleCaseWords = (value: string) =>
  normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
