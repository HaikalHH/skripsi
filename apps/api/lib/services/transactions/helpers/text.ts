export const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

export const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
