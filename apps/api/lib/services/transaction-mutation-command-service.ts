import { prisma } from "../prisma";
import { parsePositiveAmount } from "./amount-parser";
import { formatMoney } from "./money-format";
import { refreshSavingsGoalProgress } from "./goal-service";

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

const parseMutationCommand = (rawText: string): MutationCommand => {
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

const pickTransactionByHint = async (userId: string, hint: string | null) => {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 25
  });
  if (!rows.length) return null;
  if (!hint) return rows[0];

  const lowerHint = hint.toLowerCase();
  return (
    rows.find((row) => row.category.toLowerCase().includes(lowerHint)) ??
    rows.find((row) => (row.merchant ?? "").toLowerCase().includes(lowerHint)) ??
    rows.find((row) => (row.rawText ?? "").toLowerCase().includes(lowerHint)) ??
    null
  );
};

const buildTransactionLabel = (params: { category: string; merchant?: string | null }) =>
  params.merchant ? `${params.category} (${params.merchant})` : params.category;

export const tryHandleTransactionMutationCommand = async (params: {
  userId: string;
  text: string;
}): Promise<MutationResult> => {
  const command = parseMutationCommand(params.text);
  if (command.kind === "NONE") return { handled: false };

  const target = await pickTransactionByHint(params.userId, command.hint);
  if (!target) {
    return {
      handled: true,
      replyText: "Transaksi yang dimaksud tidak ditemukan."
    };
  }

  if (command.kind === "DELETE") {
    await prisma.transaction.delete({ where: { id: target.id } });
    await refreshSavingsGoalProgress(params.userId);
    return {
      handled: true,
      replyText: `Transaksi ${buildTransactionLabel(target)} sebesar ${formatMoney(
        Number(target.amount)
      )} berhasil dihapus.`
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
