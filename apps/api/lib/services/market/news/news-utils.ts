export const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export const stripCdata = (value: string) =>
  value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");

export const getTagValue = (block: string, tag: string) => {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return decodeHtml(stripCdata(match[1]).trim());
};

export const toIsoTimestamp = (value?: string | number | null) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000).toISOString();
  }

  return new Date().toISOString();
};

export const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

export const uniq = <T>(values: T[]) => Array.from(new Set(values));

export const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

export const buildNewsProviderLabel = (providerId: string) => {
  if (providerId === "marketaux") return "Marketaux";
  if (providerId === "rss_google_news") return "Google News RSS";
  return providerId;
};
