import { prisma } from "@/lib/prisma";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { formatMoney } from "@/lib/services/shared/money-format";
import { refreshSavingsGoalProgress } from "@/lib/services/planning/goal-service";

type MutationCommand =
  | { kind: "EDIT"; amount: number; hint: string | null }
  | { kind: "DELETE"; hint: string | null }
  | { kind: "NONE" };

type MutationResult =
  | {
      handled: true;
      replyText: string;
    }
  | {
      handled: false;
    };

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short"
});

const GENERIC_HINT_WORDS = new Set([
  "transaksi",
  "yang",
  "doang",
  "aja",
  "saja",
  "itu",
  "ini",
  "tadi",
  "barusan",
  "terakhir",
  "baru",
  "saja",
  "dong",
  "ya",
  "nih"
]);

type TransactionCandidate = {
  row: Awaited<ReturnType<typeof prisma.transaction.findMany>>[number];
  score: number;
};

export const parseMutationCommand = (rawText: string): MutationCommand => {
  const text = normalizeText(rawText);

  const editLatest = text.match(/^(?:ubah|edit|ganti|koreksi)\s+(?:nominal\s+)?(?:yang\s+)?(?:barusan|terakhir|baru saja)\s+(?:jadi|ke)\s+(.+)$/i);
  if (editLatest) {
    const amount = parsePositiveAmount(editLatest[1]);
    if (!amount) return { kind: "NONE" };
    return { kind: "EDIT", amount, hint: null };
  }

  const editByHint = text.match(/^(?:ubah|edit|ganti|koreksi)\s+(?:nominal\s+)?(.+?)\s+(?:jadi|ke)\s+(.+)$/i);
  if (editByHint) {
    const amount = parsePositiveAmount(editByHint[2]);
    if (!amount) return { kind: "NONE" };
    const hint = normalizeText(editByHint[1]).replace(/\b(tadi|dong|ya)\b/gi, "").trim();
    return { kind: "EDIT", amount, hint: hint || null };
  }

  const deleteLatest = text.match(/^(hapus|delete)\s+(?:yang\s+)?(?:barusan|terakhir|baru saja)$/i);
  if (deleteLatest) {
    return { kind: "DELETE", hint: null };
  }

  const deleteByHint = text.match(/^(hapus|delete)\s+(?:transaksi\s+)?(.+)$/i);
  if (deleteByHint) {
    const hint = normalizeText(deleteByHint[2]).replace(/\b(tadi|dong|ya)\b/gi, "").trim();
    if (!hint) return { kind: "NONE" };
    return { kind: "DELETE", hint };
  }

  return { kind: "NONE" };
};

const extractHintAmount = (hint: string | null) => {
  if (!hint) return null;
  const match = hint.match(/(?:rp\.?\s*)?(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
  if (!match) return null;
  return parsePositiveAmount(match[1]);
};

const extractHintTokens = (hint: string | null) => {
  if (!hint) return [];
  return normalizeText(hint)
    .toLowerCase()
    .replace(/[|/(),.-]+/g, " ")
    .split(/\s+/)
    .filter((token) => (token.length >= 2 || /^\d+$/.test(token)) && !GENERIC_HINT_WORDS.has(token));
};

const buildSearchText = (row: { category: string; merchant?: string | null; rawText?: string | null }) =>
  normalizeText([row.category, row.merchant ?? "", row.rawText ?? ""].filter(Boolean).join(" ")).toLowerCase();

const scoreTransactionCandidate = (
  row: Awaited<ReturnType<typeof prisma.transaction.findMany>>[number],
  hint: string | null
) => {
  if (!hint) return 100;

  const normalizedHint = normalizeText(hint).toLowerCase();
  const merchant = (row.merchant ?? "").toLowerCase();
  const category = row.category.toLowerCase();
  const rawText = (row.rawText ?? "").toLowerCase();
  const searchText = buildSearchText(row);
  const shortDate = SHORT_DATE_FORMATTER.format(row.occurredAt).toLowerCase();
  const amount = Number(row.amount);

  let score = 0;

  if (merchant && merchant === normalizedHint) score += 120;
  if (category === normalizedHint) score += 95;
  if (rawText && rawText === normalizedHint) score += 90;
  if (searchText.includes(normalizedHint)) score += 70;
  if (shortDate.includes(normalizedHint)) score += 50;
  if (
    normalizedHint.includes(shortDate) ||
    shortDate
      .split(/\s+/)
      .filter(Boolean)
      .every((part) => normalizedHint.includes(part))
  ) {
    score += 95;
  }

  const hintAmount = extractHintAmount(hint);
  if (hintAmount && hintAmount === amount) {
    score += 85;
  }

  const tokens = extractHintTokens(hint);
  for (const token of tokens) {
    if (merchant.includes(token)) score += 25;
    else if (category.includes(token)) score += 20;
    else if (rawText.includes(token)) score += 18;
    else if (shortDate.includes(token)) score += 18;
  }

  return score;
};

const buildCandidateOptionLabel = (row: Awaited<ReturnType<typeof prisma.transaction.findMany>>[number]) =>
  `${SHORT_DATE_FORMATTER.format(row.occurredAt)} | ${formatMoney(row.amount)} | ${buildTransactionLabel(row)}`;

const resolveTransactionCandidates = async (userId: string, hint: string | null) => {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 25
  });
  if (!rows.length) return null;
  if (!hint) return rows[0];

  const scored = rows
    .map((row) => ({
      row,
      score: scoreTransactionCandidate(row, hint)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scored.length) return null;
  if (scored.length === 1) return scored[0].row;

  const [top, second] = scored;
  if (top.score >= second.score + 35 || top.score >= second.score * 2) {
    return top.row;
  }

  return scored.slice(0, 4);
};

const buildTransactionLabel = (params: { category: string; merchant?: string | null }) =>
  params.merchant ? `${params.category} (${params.merchant})` : params.category;

export const tryHandleTransactionMutationCommand = async (params: {
  userId: string;
  text: string;
}): Promise<MutationResult> => {
  const command = parseMutationCommand(params.text);
  if (command.kind === "NONE") return { handled: false };

  const target = await resolveTransactionCandidates(params.userId, command.hint);
  if (!target) {
    return {
      handled: true,
      replyText: "Transaksi yang dimaksud tidak ditemukan."
    };
  }
  if (Array.isArray(target)) {
    const actionLabel =
      command.kind === "DELETE"
        ? "Saya ketemu beberapa transaksi yang mirip untuk dihapus:"
        : `Saya ketemu beberapa transaksi yang mirip untuk diubah jadi ${formatMoney(command.amount)}:`;
    return {
      handled: true,
      replyText: [
        actionLabel,
        ...target.map((candidate, index) => `${index + 1}. ${buildCandidateOptionLabel(candidate.row)}`),
        "Balas nomor transaksi yang dimaksud ya Boss."
      ].join("\n")
    };
  }

  if (command.kind === "DELETE") {
    await prisma.transaction.delete({ where: { id: target.id } });
    await refreshSavingsGoalProgress(params.userId);
    return {
      handled: true,
      replyText: `Transaksi ${buildTransactionLabel(target)} sebesar ${formatMoney(target.amount)} berhasil dihapus.`
    };
  }

  const updated = await prisma.transaction.update({
    where: { id: target.id },
    data: { amount: command.amount }
  });
  await refreshSavingsGoalProgress(params.userId);

  return {
    handled: true,
    replyText: `Transaksi ${buildTransactionLabel(updated)} diperbarui jadi ${formatMoney(
      command.amount
    )}.`
  };
};
