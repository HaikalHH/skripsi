export const futureValueWithContribution = (params: {
  startingAmount?: number;
  monthlyContribution: number;
  totalMonths: number;
  annualRate: number;
}) => {
  const startingAmount = Math.max(0, params.startingAmount ?? 0);
  const monthlyContribution = Math.max(0, params.monthlyContribution);
  const totalMonths = Math.max(0, Math.round(params.totalMonths));
  const annualRate = Math.max(0, params.annualRate);

  if (totalMonths <= 0) return startingAmount;

  const monthlyRate = annualRate / 12;
  if (monthlyRate <= 0) {
    return startingAmount + monthlyContribution * totalMonths;
  }

  const growthFactor = Math.pow(1 + monthlyRate, totalMonths);
  return (
    startingAmount * growthFactor +
    monthlyContribution * ((growthFactor - 1) / monthlyRate)
  );
};

export const estimateMonthsToReachTarget = (params: {
  startingAmount?: number;
  monthlyContribution: number;
  targetAmount: number;
  annualRate: number;
  maxMonths?: number;
}) => {
  const targetAmount = Math.max(0, params.targetAmount);
  const startingAmount = Math.max(0, params.startingAmount ?? 0);
  const monthlyContribution = Math.max(0, params.monthlyContribution);
  const annualRate = Math.max(0, params.annualRate);
  const maxMonths = Math.max(1, params.maxMonths ?? 100 * 12);

  if (startingAmount >= targetAmount) return 0;
  if (monthlyContribution <= 0 && annualRate <= 0) return null;

  const monthlyRate = annualRate / 12;
  let value = startingAmount;

  for (let month = 1; month <= maxMonths; month += 1) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    if (value >= targetAmount) {
      return month;
    }
  }

  return null;
};

export const futureValueWithGrowingContribution = (params: {
  startingAmount?: number;
  initialMonthlyContribution: number;
  totalMonths: number;
  annualRate: number;
  annualContributionGrowthRate: number;
}) => {
  const startingAmount = Math.max(0, params.startingAmount ?? 0);
  const initialMonthlyContribution = Math.max(0, params.initialMonthlyContribution);
  const totalMonths = Math.max(0, Math.round(params.totalMonths));
  const annualRate = Math.max(0, params.annualRate);
  const annualContributionGrowthRate = Math.max(0, params.annualContributionGrowthRate);

  if (totalMonths <= 0) return startingAmount;

  const monthlyRate = annualRate / 12;
  let value = startingAmount;
  let monthlyContribution = initialMonthlyContribution;

  for (let month = 1; month <= totalMonths; month += 1) {
    if (month > 1 && (month - 1) % 12 === 0) {
      monthlyContribution *= 1 + annualContributionGrowthRate / 100;
    }
    value = value * (1 + monthlyRate) + monthlyContribution;
  }

  return value;
};

export const totalGrowingContributions = (params: {
  initialMonthlyContribution: number;
  totalMonths: number;
  annualContributionGrowthRate: number;
}) => {
  const initialMonthlyContribution = Math.max(0, params.initialMonthlyContribution);
  const totalMonths = Math.max(0, Math.round(params.totalMonths));
  const annualContributionGrowthRate = Math.max(0, params.annualContributionGrowthRate);

  let total = 0;
  let monthlyContribution = initialMonthlyContribution;

  for (let month = 1; month <= totalMonths; month += 1) {
    if (month > 1 && (month - 1) % 12 === 0) {
      monthlyContribution *= 1 + annualContributionGrowthRate / 100;
    }
    total += monthlyContribution;
  }

  return total;
};

export const estimateMonthsToReachTargetWithGrowingContribution = (params: {
  startingAmount?: number;
  initialMonthlyContribution: number;
  targetAmount: number;
  annualRate: number;
  annualContributionGrowthRate: number;
  maxMonths?: number;
}) => {
  const startingAmount = Math.max(0, params.startingAmount ?? 0);
  const initialMonthlyContribution = Math.max(0, params.initialMonthlyContribution);
  const targetAmount = Math.max(0, params.targetAmount);
  const annualRate = Math.max(0, params.annualRate);
  const annualContributionGrowthRate = Math.max(0, params.annualContributionGrowthRate);
  const maxMonths = Math.max(1, params.maxMonths ?? 100 * 12);

  if (startingAmount >= targetAmount) return 0;
  if (initialMonthlyContribution <= 0 && annualRate <= 0) return null;

  const monthlyRate = annualRate / 12;
  let value = startingAmount;
  let monthlyContribution = initialMonthlyContribution;

  for (let month = 1; month <= maxMonths; month += 1) {
    if (month > 1 && (month - 1) % 12 === 0) {
      monthlyContribution *= 1 + annualContributionGrowthRate / 100;
    }
    value = value * (1 + monthlyRate) + monthlyContribution;
    if (value >= targetAmount) {
      return month;
    }
  }

  return null;
};

export const requiredMonthlyContributionForTarget = (params: {
  startingAmount?: number;
  targetAmount: number;
  totalMonths: number;
  annualRate: number;
}) => {
  const startingAmount = Math.max(0, params.startingAmount ?? 0);
  const targetAmount = Math.max(0, params.targetAmount);
  const totalMonths = Math.max(0, Math.round(params.totalMonths));
  const annualRate = Math.max(0, params.annualRate);

  if (targetAmount <= startingAmount) return 0;
  if (totalMonths <= 0) return null;

  const monthlyRate = annualRate / 12;
  if (monthlyRate <= 0) {
    return (targetAmount - startingAmount) / totalMonths;
  }

  const growthFactor = Math.pow(1 + monthlyRate, totalMonths);
  const futureValueOfStart = startingAmount * growthFactor;
  const remainingTarget = targetAmount - futureValueOfStart;
  if (remainingTarget <= 0) return 0;

  const annuityFactor = (growthFactor - 1) / monthlyRate;
  if (!Number.isFinite(annuityFactor) || annuityFactor <= 0) return null;
  return remainingTarget / annuityFactor;
};

export const formatDurationFromMonths = (months: number | null) => {
  if (months === null || !Number.isFinite(months)) return "belum terestimasi";
  if (months <= 0) return "sudah tercapai";

  const rounded = Math.max(1, Math.round(months));
  const years = Math.floor(rounded / 12);
  const remainingMonths = rounded % 12;

  if (years <= 0) {
    return `${remainingMonths} bulan`;
  }

  if (remainingMonths === 0) {
    return `${years} tahun`;
  }

  return `${years} tahun ${remainingMonths} bulan`;
};
