import { prisma } from "@/lib/prisma";
import { scoreTransactionCandidate } from "./hint-scoring";

export const resolveTransactionCandidates = async (userId: string, hint: string | null) => {
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
