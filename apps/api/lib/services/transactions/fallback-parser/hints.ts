export const INCOME_HINTS = [
  /\bgaji\b/i,
  /\bsalary\b/i,
  /\bpendapatan\b/i,
  /\bpemasukan\b/i,
  /\bincome\b/i,
  /\bbonus\b/i,
  /\bkomisi\b/i,
  /\binsentif\b/i,
  /\bmasuk\b/i
];

export const EXPENSE_HINTS = [
  /\bbeli\b/i,
  /\bbayar\b/i,
  /\bbelanja\b/i,
  /\bmakan\b/i,
  /\bngopi\b/i,
  /\bkopi\b/i,
  /\bexpense\b/i,
  /\bpengeluaran\b/i,
  /\bkeluar\b/i,
  /\bjajan\b/i,
  /\bspend\b/i
];

export const countMatches = (text: string, patterns: RegExp[]) =>
  patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
