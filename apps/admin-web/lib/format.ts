const compactFormatter = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1
});

export function formatCurrency(value: number | null | undefined, currency = "IDR") {
  if (value == null) {
    return "-";
  }

  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "IDR" ? 0 : 2
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("id-ID")}`;
  }
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function formatShortId(value: string, visible = 8) {
  if (!value) {
    return "-";
  }

  return value.length <= visible ? value : `${value.slice(0, visible)}...`;
}

export function formatCompactNumber(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  return compactFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1) {
  if (value == null) {
    return "-";
  }

  return `${value.toFixed(fractionDigits)}%`;
}
