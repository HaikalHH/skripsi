import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { formatMoney } from "@/lib/services/shared/money-format";
import {
  estimateMonthsToReachTargetWithGrowingContribution,
  estimateMonthsToReachTarget,
  formatDurationFromMonths,
  futureValueWithContribution,
  futureValueWithGrowingContribution,
  totalGrowingContributions
} from "@/lib/services/shared/projection-math-service";

const DURATION_PROJECTION_PATTERN =
  /(?:kalau|jika)\s+(nabung|invest(?:asi)?)\s+(.+?)(?:\/?\s*(?:bulan|bln)|\s+tiap\s+bulan|\s+per\s+bulan)\s+(\d+)\s*(tahun|thn|bulan|bln).*(?:jadi\s+berapa|hasilnya\s+berapa|berapa\s+nanti)/i;
const TARGET_PROJECTION_PATTERN =
  /(?:kalau|jika)\s+(nabung|invest(?:asi)?)\s+(.+?)(?:\/?\s*(?:bulan|bln)|\s+tiap\s+bulan|\s+per\s+bulan)\s+(?:sampai|target)\s+(.+?)(?:\s+(?:berapa\s+lama|kapan\s+tercapai|butuh\s+berapa\s+lama|berapa\s+bulan|berapa\s+tahun))$/i;
const STARTING_AMOUNT_PATTERN =
  /\b(?:mulai dari|start(?:ing)?(?: amount)?|modal awal|starting from)\s+([\d.,]+(?:\s*(?:jt|juta|rb|ribu|k))?)/i;
const CONTRIBUTION_GROWTH_PATTERN =
  /\b(?:(?:setoran|kontribusi)\s+)?naik\s+(\d{1,2})(?:[.,]\d+)?\s*%\s*(?:per|tiap)\s*tahun\b/i;

const RATE_SET_BY_MODE = {
  saving: { konservatif: 0.02, moderat: 0.04, agresif: 0.06 },
  investing: { konservatif: 0.06, moderat: 0.1, agresif: 0.14 }
} as const;

const toMonths = (duration: number, unit: string) => {
  if (/^tahun|thn$/i.test(unit)) return duration * 12;
  return duration;
};

const buildProjectionLine = (label: string, value: number) =>
  `- ${label}: ${formatMoney(value)}`;

export const tryHandleWealthProjection = (text: string) => {
  const startingAmountMatch = text.match(STARTING_AMOUNT_PATTERN);
  const startingAmount = startingAmountMatch ? parsePositiveAmount(startingAmountMatch[1]) ?? 0 : 0;
  const contributionGrowthMatch = text.match(CONTRIBUTION_GROWTH_PATTERN);
  const annualContributionGrowthRate = contributionGrowthMatch ? Number(contributionGrowthMatch[1]) : 0;
  const normalizedText = text
    .replace(STARTING_AMOUNT_PATTERN, " ")
    .replace(CONTRIBUTION_GROWTH_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  const targetMatch = normalizedText.match(TARGET_PROJECTION_PATTERN);
  if (targetMatch) {
    const mode = targetMatch[1].toLowerCase();
    const monthlyContribution = parsePositiveAmount(targetMatch[2]);
    const targetAmount = parsePositiveAmount(targetMatch[3]);

    if (!monthlyContribution || !targetAmount) {
      return {
        handled: true as const,
        replyText:
          "Format target proyeksi belum valid. Contoh: `kalau invest 3 juta per bulan target 1 miliar kapan tercapai`."
      };
    }

    const rateSet = mode.startsWith("invest")
      ? RATE_SET_BY_MODE.investing
      : RATE_SET_BY_MODE.saving;

    const conservativeMonths = estimateMonthsToReachTarget({
      startingAmount,
      monthlyContribution,
      targetAmount,
      annualRate: rateSet.konservatif
    });
    const moderateMonths = estimateMonthsToReachTarget({
      startingAmount,
      monthlyContribution,
      targetAmount,
      annualRate: rateSet.moderat
    });
    const aggressiveMonths = estimateMonthsToReachTarget({
      startingAmount,
      monthlyContribution,
      targetAmount,
      annualRate: rateSet.agresif
    });
    const steppedUpMonths =
      annualContributionGrowthRate > 0
        ? estimateMonthsToReachTargetWithGrowingContribution({
            startingAmount,
            initialMonthlyContribution: monthlyContribution,
            targetAmount,
            annualRate: rateSet.moderat,
            annualContributionGrowthRate
          })
        : null;
    const scenarioSpread =
      conservativeMonths != null && aggressiveMonths != null
        ? Math.max(0, conservativeMonths - aggressiveMonths)
        : null;

    return {
      handled: true as const,
      replyText: [
        `Estimasi waktu menuju target ${formatMoney(targetAmount)}:`,
        startingAmount > 0 ? `- Modal awal: ${formatMoney(startingAmount)}` : null,
        `- Setoran bulanan: ${formatMoney(monthlyContribution)}`,
        `- Skenario konservatif: ${formatDurationFromMonths(conservativeMonths)}`,
        `- Skenario moderat: ${formatDurationFromMonths(moderateMonths)}`,
        `- Skenario agresif: ${formatDurationFromMonths(aggressiveMonths)}`,
        annualContributionGrowthRate > 0
          ? `- Kalau setoran naik ${annualContributionGrowthRate}%/tahun: ${formatDurationFromMonths(steppedUpMonths)}`
          : null,
        `- Selisih konservatif vs agresif: ${formatDurationFromMonths(scenarioSpread)}`
      ]
        .filter(Boolean)
        .join("\n")
    };
  }

  const match = normalizedText.match(DURATION_PROJECTION_PATTERN);
  if (!match) return { handled: false as const };

  const mode = match[1].toLowerCase();
  const monthlyContribution = parsePositiveAmount(match[2]);
  const duration = Number(match[3]);
  const unit = match[4];
  if (!monthlyContribution || !Number.isFinite(duration) || duration <= 0) {
    return {
      handled: true as const,
      replyText:
        "Format simulasi belum valid. Contoh: `kalau nabung 2 juta/bulan 5 tahun jadi berapa`."
    };
  }

  const months = toMonths(duration, unit);
  const rateSet = mode.startsWith("invest")
    ? RATE_SET_BY_MODE.investing
    : RATE_SET_BY_MODE.saving;

  const conservative = futureValueWithContribution({
    startingAmount,
    monthlyContribution,
    totalMonths: months,
    annualRate: rateSet.konservatif
  });
  const moderate = futureValueWithContribution({
    startingAmount,
    monthlyContribution,
    totalMonths: months,
    annualRate: rateSet.moderat
  });
  const aggressive = futureValueWithContribution({
    startingAmount,
    monthlyContribution,
    totalMonths: months,
    annualRate: rateSet.agresif
  });
  const steppedUp = annualContributionGrowthRate > 0
    ? futureValueWithGrowingContribution({
        startingAmount,
        initialMonthlyContribution: monthlyContribution,
        totalMonths: months,
        annualRate: rateSet.moderat,
        annualContributionGrowthRate
      })
    : null;
  const totalContribution = monthlyContribution * months;
  const conservativeGain = conservative - totalContribution - startingAmount;
  const moderateGain = moderate - totalContribution - startingAmount;
  const aggressiveGain = aggressive - totalContribution - startingAmount;
  const steppedUpContribution = annualContributionGrowthRate > 0
    ? totalGrowingContributions({
        initialMonthlyContribution: monthlyContribution,
        totalMonths: months,
        annualContributionGrowthRate
      })
    : null;
  const steppedUpGain =
    steppedUp != null && steppedUpContribution != null
      ? steppedUp - steppedUpContribution - startingAmount
      : null;

  return {
    handled: true as const,
    replyText: [
      `Simulasi ${mode.startsWith("invest") ? "investasi" : "tabungan"} untuk ${months} bulan:`,
      startingAmount > 0 ? buildProjectionLine("Modal awal", startingAmount) : null,
      buildProjectionLine("Total setoran", totalContribution),
      `${buildProjectionLine("Skenario konservatif", conservative)} | hasil ${formatMoney(conservativeGain)}`,
      `${buildProjectionLine("Skenario moderat", moderate)} | hasil ${formatMoney(moderateGain)}`,
      `${buildProjectionLine("Skenario agresif", aggressive)} | hasil ${formatMoney(aggressiveGain)}`,
      annualContributionGrowthRate > 0 && steppedUp != null && steppedUpContribution != null && steppedUpGain != null
        ? `- Skenario setoran naik ${annualContributionGrowthRate}%/tahun: ${formatMoney(steppedUp)} | total setoran ${formatMoney(steppedUpContribution)} | hasil ${formatMoney(steppedUpGain)}`
        : null
    ]
      .filter(Boolean)
      .join("\n")
  };
};
