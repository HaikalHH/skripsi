import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateInputSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

const querySchema = z.object({
  userId: z.string().optional(),
  type: z.nativeEnum(TransactionType).optional(),
  startDate: dateInputSchema.optional(),
  endDate: dateInputSchema.optional()
});

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.issues }, { status: 400 });
  }

  const { userId, type, startDate, endDate } = parsed.data;

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      type,
      occurredAt:
        startDate || endDate
          ? {
              gte: startDate ? new Date(startDate) : undefined,
              lte: endDate ? new Date(endDate) : undefined
            }
          : undefined
    },
    include: {
      user: {
        select: {
          waNumber: true
        }
      }
    },
    orderBy: { occurredAt: "desc" },
    take: 500
  });

  return NextResponse.json({
    transactions: transactions.map((tx) => ({
      id: tx.id,
      userId: tx.userId,
      waNumber: tx.user.waNumber,
      type: tx.type,
      amount: Number(tx.amount),
      category: tx.category,
      merchant: tx.merchant,
      note: tx.note,
      occurredAt: tx.occurredAt.toISOString(),
      source: tx.source,
      createdAt: tx.createdAt.toISOString()
    }))
  });
}
