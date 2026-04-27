export type MoneyInput =
  | number
  | bigint
  | string
  | null
  | undefined
  | { toString(): string };

type FormatMoneyOptions = {
  withMagnitudeLabel?: boolean;
};

type NormalizedMoneyValue = {
  sign: "" | "-";
  integerPart: string;
  fractionPart: string;
};

const ZERO_MONEY_VALUE: NormalizedMoneyValue = {
  sign: "",
  integerPart: "0",
  fractionPart: ""
};

const INTEGER_GROUP_PATTERN = /\B(?=(\d{3})+(?!\d))/g;
const MAGNITUDE_LABELS = [
  { power: 9, suffix: "miliar" },
  { power: 6, suffix: "juta" },
  { power: 3, suffix: "ribu" }
] as const;

const stripLeadingZeros = (value: string) => value.replace(/^0+(?=\d)/, "") || "0";

const expandScientificNotation = (value: string) => {
  const match = value.match(/^([+-]?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
  if (!match) return value;

  const [, sign, integerPart, fractionPart = "", exponentText] = match;
  const exponent = Number(exponentText);
  if (!Number.isFinite(exponent)) return value;

  const digits = `${integerPart}${fractionPart}`;
  const decimalIndex = integerPart.length + exponent;

  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }

  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
};

const detectDecimalSeparator = (value: string): "." | "," | null => {
  const dotCount = (value.match(/\./g) ?? []).length;
  const commaCount = (value.match(/,/g) ?? []).length;

  if (dotCount > 0 && commaCount > 0) {
    return value.lastIndexOf(".") > value.lastIndexOf(",") ? "." : ",";
  }

  if (commaCount > 0) {
    const groups = value.split(",");
    const lastGroup = groups[groups.length - 1] ?? "";
    if (commaCount > 1 && groups.slice(1).every((group) => group.length === 3)) {
      return null;
    }
    return lastGroup.length === 3 ? null : ",";
  }

  if (dotCount > 0) {
    const groups = value.split(".");
    const lastGroup = groups[groups.length - 1] ?? "";
    if (dotCount > 1 && groups.slice(1).every((group) => group.length === 3)) {
      return null;
    }
    return lastGroup.length === 3 ? null : ".";
  }

  return null;
};

const normalizeMoneyString = (value: string): NormalizedMoneyValue => {
  let normalized = value.trim().replace(/\s+/g, "");
  if (!normalized) return ZERO_MONEY_VALUE;

  let sign: "" | "-" = "";
  if (normalized.startsWith("-")) {
    sign = "-";
    normalized = normalized.slice(1);
  } else if (normalized.startsWith("+")) {
    normalized = normalized.slice(1);
  }

  normalized = normalized.replace(/^rp\.?/i, "");
  if (normalized.startsWith("-")) {
    sign = "-";
    normalized = normalized.slice(1);
  } else if (normalized.startsWith("+")) {
    normalized = normalized.slice(1);
  }

  normalized = expandScientificNotation(normalized);
  if (!/^[\d.,]+$/.test(normalized)) return ZERO_MONEY_VALUE;

  const decimalSeparator = detectDecimalSeparator(normalized);
  let canonical = normalized;
  if (decimalSeparator) {
    const separatorIndex = canonical.lastIndexOf(decimalSeparator);
    const integerPart = canonical.slice(0, separatorIndex).replace(/[.,]/g, "");
    const fractionPart = canonical.slice(separatorIndex + 1).replace(/[.,]/g, "");
    canonical = `${integerPart || "0"}.${fractionPart}`;
  } else {
    canonical = canonical.replace(/[.,]/g, "");
  }

  if (!/^\d+(?:\.\d+)?$/.test(canonical)) return ZERO_MONEY_VALUE;

  const [integerRaw, fractionRaw = ""] = canonical.split(".");
  const integerPart = stripLeadingZeros(integerRaw);
  const fractionPart = fractionRaw.replace(/[^\d]/g, "");
  const isZero = integerPart === "0" && (!fractionPart || /^0+$/.test(fractionPart));

  return {
    sign: isZero ? "" : sign,
    integerPart,
    fractionPart: isZero ? "" : fractionPart
  };
};

const normalizeMoneyInput = (amount: MoneyInput): NormalizedMoneyValue => {
  if (typeof amount === "bigint") {
    const sign = amount < 0n ? "-" : "";
    const absolute = amount < 0n ? -amount : amount;
    return {
      sign,
      integerPart: absolute.toString(),
      fractionPart: ""
    };
  }

  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) return ZERO_MONEY_VALUE;
    return normalizeMoneyString(amount.toString());
  }

  if (typeof amount === "string") {
    return normalizeMoneyString(amount);
  }

  if (amount && typeof amount === "object" && "toString" in amount) {
    return normalizeMoneyString(amount.toString());
  }

  return ZERO_MONEY_VALUE;
};

const formatIntegerPart = (value: string) => value.replace(INTEGER_GROUP_PATTERN, ".");

const roundNormalizedMoneyValue = (
  value: NormalizedMoneyValue,
  maximumFractionDigits: number
): NormalizedMoneyValue => {
  if (maximumFractionDigits < 0) return ZERO_MONEY_VALUE;

  const paddedFraction = value.fractionPart.padEnd(maximumFractionDigits + 1, "0");
  const keptFraction = paddedFraction.slice(0, maximumFractionDigits);
  const roundingDigit = paddedFraction[maximumFractionDigits] ?? "0";
  const scaledValue = BigInt(`${value.integerPart}${keptFraction}`);
  const roundedScaledValue = roundingDigit >= "5" ? scaledValue + 1n : scaledValue;
  const roundedScaledString = roundedScaledValue.toString();

  if (maximumFractionDigits === 0) {
    const integerPart = stripLeadingZeros(roundedScaledString);
    const isZero = integerPart === "0";
    return {
      sign: isZero ? "" : value.sign,
      integerPart,
      fractionPart: ""
    };
  }

  const splitIndex = Math.max(0, roundedScaledString.length - maximumFractionDigits);
  const integerPart =
    splitIndex > 0 ? stripLeadingZeros(roundedScaledString.slice(0, splitIndex)) : "0";
  const fractionPart = (splitIndex > 0 ? roundedScaledString.slice(splitIndex) : roundedScaledString)
    .padStart(maximumFractionDigits, "0")
    .replace(/0+$/, "");
  const isZero = integerPart === "0" && !fractionPart;

  return {
    sign: isZero ? "" : value.sign,
    integerPart,
    fractionPart
  };
};

const buildMagnitudeLabel = ({ integerPart, fractionPart }: NormalizedMoneyValue) => {
  if (fractionPart && !/^0+$/.test(fractionPart)) return "";

  for (const { power, suffix } of MAGNITUDE_LABELS) {
    const threshold = 10 ** power;
    if (integerPart.length < String(threshold).length) continue;

    const wholePart = integerPart.slice(0, -power) || "0";
    const remainder = integerPart.slice(-power).padStart(power, "0");
    const firstDecimalDigit = remainder[0] ?? "0";
    const compactNumber =
      wholePart.length === 1 && firstDecimalDigit !== "0"
        ? `${wholePart},${firstDecimalDigit}`
        : wholePart;

    return `(${compactNumber} ${suffix})`;
  }

  return "";
};

export const formatMoney = (amount: MoneyInput, options: FormatMoneyOptions = {}) => {
  const normalized = roundNormalizedMoneyValue(normalizeMoneyInput(amount), 2);
  const fractionText = normalized.fractionPart ? `,${normalized.fractionPart}` : "";
  const formatted = `${normalized.sign ? "-Rp. " : "Rp. "}${formatIntegerPart(normalized.integerPart)}${fractionText}`;
  const magnitudeLabel = options.withMagnitudeLabel ? buildMagnitudeLabel(normalized) : "";

  return magnitudeLabel ? `${formatted} ${magnitudeLabel}` : formatted;
};

export const formatMoneyWhole = (amount: MoneyInput) => {
  const normalized = roundNormalizedMoneyValue(normalizeMoneyInput(amount), 0);
  return `${normalized.sign ? "-Rp. " : "Rp. "}${formatIntegerPart(normalized.integerPart)}`;
};

export const formatPercent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;
