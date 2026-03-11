import { parsePositiveAmount } from "./amount-parser";
import { formatMoney } from "./money-format";
import {
  estimateMonthsToReachTarget,
  formatDurationFromMonths,
  futureValueWithContribution
} from "./projection-math-service";

const DURATION_PROJECTION_PATTERN =
  /(?:kalau|jika)\s+(nabung|invest(?:asi)?)\s+(.+?)(?:\/?\s*(?:bulan|bln)|\s+tiap\s+bulan|\s+per\s+bulan)\s+(\d+)\s*(tahun|thn|bulan|bln).*(?:jadi\s+berapa|hasilnya\s+berapa|berapa\s+nanti)/i;
const TARGET_PROJECTION_PATTERN =
  /(?:kalau|jika)\s+(nabung|invest(?:asi)?)\s+(.+?)(?:\/?\s*(?:bulan|bln)|\s+tiap\s+bulan|\s+per\s+bulan)\s+(?:sampai|target)\s+(.+?)(?:\s+(?:berapa\s+lama|kapan\s+tercapai|butuh\s+berapa\s+lama|berapa\s+bulan|berapa\s+tahun))$/i;

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
  const targetMatch = text.match(TARGET_PROJECTION_PATTERN);
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
      monthlyContribution,
      targetAmount,
      annualRate: rateSet.konservatif
    });
    const moderateMonths = estimateMonthsToReachTarget({
      monthlyContribution,
      targetAmount,
      annualRate: rateSet.moderat
    });
    const aggressiveMonths = estimateMonthsToReachTarget({
      monthlyContribution,
      targetAmount,
      annualRate: rateSet.agresif
    });

    return {
      handled: true as const,
      replyText: [
        `Estimasi waktu menuju target ${formatMoney(targetAmount)}:`,
        `- Skenario konservatif: ${formatDurationFromMonths(conservativeMonths)}`,
        `- Skenario moderat: ${formatDurationFromMonths(moderateMonths)}`,
        `- Skenario agresif: ${formatDurationFromMonths(aggressiveMonths)}`
      ].join("\n")
    };
  }

  const match = text.match(DURATION_PROJECTION_PATTERN);
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
    monthlyContribution,
    totalMonths: months,
    annualRate: rateSet.konservatif
  });
  const moderate = futureValueWithContribution({
    monthlyContribution,
    totalMonths: months,
    annualRate: rateSet.moderat
  });
  const aggressive = futureValueWithContribution({
    monthlyContribution,
    totalMonths: months,
    annualRate: rateSet.agresif
  });
  const totalContribution = monthlyContribution * months;

  return {
    handled: true as const,
    replyText: [
      `Simulasi ${mode.startsWith("invest") ? "investasi" : "tabungan"} untuk ${months} bulan:`,
      buildProjectionLine("Total setoran", totalContribution),
      buildProjectionLine("Skenario konservatif", conservative),
      buildProjectionLine("Skenario moderat", moderate),
      buildProjectionLine("Skenario agresif", aggressive)
    ].join("\n")
  };
};
