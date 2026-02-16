import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "mysql://finance:finance@localhost:3306/finance_bot";
}

declare global {
  // eslint-disable-next-line no-var
  var __financePrisma: PrismaClient | undefined;
}

export const prisma =
  global.__financePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__financePrisma = prisma;
}
