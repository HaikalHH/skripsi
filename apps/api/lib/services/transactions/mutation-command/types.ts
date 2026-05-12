import type { prisma } from "@/lib/prisma";

export type MutationCommand =
  | { kind: "EDIT"; amount: number; hint: string | null }
  | { kind: "DELETE"; hint: string | null }
  | { kind: "NONE" };

export type MutationResult =
  | {
      handled: true;
      replyText: string;
    }
  | {
      handled: false;
    };

export type TransactionRow = Awaited<ReturnType<typeof prisma.transaction.findMany>>[number];

export type TransactionCandidate = {
  row: TransactionRow;
  score: number;
};
