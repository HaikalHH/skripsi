const IDR_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export const formatMoney = (amount: number) => `Rp${IDR_FORMATTER.format(Math.max(0, amount))}`;

export const formatPercent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;
