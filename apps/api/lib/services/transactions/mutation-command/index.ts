import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/services/shared/money";
import { refreshSavingsGoalProgress } from "@/lib/services/planning/goal";
import { resolveTransactionCandidates } from "./candidate-resolver";
import { buildCandidateOptionLabel, buildTransactionLabel, formatShortTransactionDate } from "./labels";
import { parseMutationCommand } from "./parser";
import type { MutationResult } from "./types";

export { parseMutationCommand } from "./parser";

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
    if (!command.hint) {
      return {
        handled: true,
        needsConfirmation: true,
        replyText: [
          "🗑️ Transaksi terakhir yang ditemukan:",
          `- Category: ${buildTransactionLabel(target)}`,
          `- Amount: ${formatMoney(target.amount)}`,
          `- Tanggal: ${formatShortTransactionDate(target.occurredAt)}`,
        ].join("\n"),
        candidateTransaction: target
      };
    }
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
