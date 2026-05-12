import { formatMoney } from "@/lib/services/shared/money-format";
import type { TransactionRow } from "./types";

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short"
});

export const formatShortTransactionDate = (date: Date) => SHORT_DATE_FORMATTER.format(date);

export const buildTransactionLabel = (params: { category: string; merchant?: string | null }) =>
  params.merchant ? `${params.category} (${params.merchant})` : params.category;

export const buildCandidateOptionLabel = (row: TransactionRow) =>
  `${formatShortTransactionDate(row.occurredAt)} | ${formatMoney(row.amount)} | ${buildTransactionLabel(row)}`;
