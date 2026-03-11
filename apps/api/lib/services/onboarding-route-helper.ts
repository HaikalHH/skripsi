import { AssetType, FinancialGoalType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { findOrCreateUserByWaNumber } from "./user-service";

const baseUserIdentitySchema = z.object({
  userId: z.string().min(1).optional(),
  waNumber: z.string().min(6).optional()
});

export const userIdentitySchema = baseUserIdentitySchema.refine(
  (value) => Boolean(value.userId || value.waNumber),
  {
    message: "userId or waNumber is required"
  }
);

export const onboardingAnswerBodySchema = baseUserIdentitySchema
  .extend({
    answer: z.unknown()
  })
  .refine((value) => Boolean(value.userId || value.waNumber), {
    message: "userId or waNumber is required"
  });

export const goalCreateBodySchema = baseUserIdentitySchema
  .extend({
    goalType: z.nativeEnum(FinancialGoalType),
    goalName: z.string().min(1).max(120),
    targetAmount: z.number().int().nonnegative().nullable().optional(),
    targetAge: z.number().int().min(18).max(100).nullable().optional()
  })
  .refine((value) => Boolean(value.userId || value.waNumber), {
    message: "userId or waNumber is required"
  });

export const assetCreateBodySchema = baseUserIdentitySchema
  .extend({
    assetType: z.nativeEnum(AssetType),
    assetName: z.string().min(1).max(120),
    quantity: z.number().positive().nullable().optional(),
    unit: z.string().min(1).max(40).nullable().optional(),
    estimatedValue: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().max(255).nullable().optional()
  })
  .refine((value) => Boolean(value.userId || value.waNumber), {
    message: "userId or waNumber is required"
  });

export const resolveUserIdentity = async (identity: z.infer<typeof userIdentitySchema>) => {
  if (identity.userId) {
    const user = await prisma.user.findUnique({ where: { id: identity.userId } });
    if (!user) throw new Error("User not found");
    return user;
  }

  const result = await findOrCreateUserByWaNumber(identity.waNumber!);
  return result.user;
};

export const toJsonSafe = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return Number(item);
      return item;
    })
  ) as T;
