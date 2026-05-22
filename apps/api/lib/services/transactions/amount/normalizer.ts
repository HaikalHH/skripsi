export const normalizeAmountInput = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("-")) return "";
  return trimmed
    .toLowerCase()
    .replace(/^rp\.?\s*/i, "")
    .replace(/\bidr\b/g, " ")
    .replace(/\brupiah\b/g, " ")
    .replace(/\s*(?:\/\s*bulan|per\s*bulan|\/\s*bln|per\s*bln)\s*$/i, "")
    .replace(/[-/]/g, " ")
    .replace(/\bratur\b/g, "ratus")
    .replace(/\bsejuta\b/g, "satu juta")
    .replace(/\bseribu\b/g, "satu ribu")
    .replace(/\bseratus\b/g, "satu ratus")
    .replace(/\bsepuluh\b/g, "satu puluh")
    .replace(/\bsebelas\b/g, "satu belas")
    .replace(/\s+/g, " ")
    .trim();
};

