const IDR_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const formatMoney = (amount: number) => {
  const normalized = Number.isFinite(amount) ? amount : 0;
  const prefix = normalized < 0 ? "-" : "";
  return `${prefix}Rp. ${IDR_FORMATTER.format(Math.abs(normalized))}`;
};

export const formatPercent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;
