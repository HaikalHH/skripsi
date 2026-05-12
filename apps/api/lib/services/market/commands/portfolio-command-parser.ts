export const isPortfolioSummaryCommand = (text: string) =>
  /^(portfolio|portofolio|aset investasi|lihat portfolio|lihat portofolio|portfolio aku|portfolio saya|portofolio aku|portofolio saya|aset aku|aset saya|asetku|nilai aset|berapa aset|komposisi aset)\b/i.test(
    text
  );

export const isPortfolioRiskCommand = (text: string) =>
  /\b(risiko portfolio|risiko portofolio|portfolio .* aman|portofolio .* aman|perlu rebalance|rebalance gak|rebalance portfolio|portfolio terlalu numpuk|portofolio terlalu numpuk|komposisi portfolio .* aman|komposisi portofolio .* aman)\b/i.test(
    text
  );

export const isPortfolioPerformanceCommand = (text: string) =>
  /\b(aset paling cuan|aset paling rugi|profit portfolio|rugi portfolio|performa portfolio|portfolio cuan|portfolio rugi)\b/i.test(
    text
  );

export const isPortfolioDiversificationCommand = (text: string) =>
  /\b(diversifikasi portfolio|diversifikasi portofolio|portfolio terdiversifikasi|portofolio terdiversifikasi|portfolio tersebar|portofolio tersebar)\b/i.test(
    text
  );

export const isPortfolioDominanceCommand = (text: string) =>
  /\b(aset paling dominan|holding terbesar|aset terbesar|portfolio paling besar di mana|portfolio paling dominan|aset yang paling numpuk)\b/i.test(
    text
  );
