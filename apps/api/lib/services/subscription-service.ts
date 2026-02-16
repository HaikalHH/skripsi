import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../prisma";

const USABLE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIAL
];

export const getLatestSubscription = async (userId: string) =>
  prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });

export const hasUsableSubscription = async (userId: string): Promise<boolean> => {
  const latest = await getLatestSubscription(userId);
  if (!latest) return false;
  return USABLE_SUBSCRIPTION_STATUSES.includes(latest.status);
};

export const activateSubscription = async (userId: string) => {
  const latest = await getLatestSubscription(userId);
  if (latest) {
    return prisma.subscription.update({
      where: { id: latest.id },
      data: { status: SubscriptionStatus.ACTIVE }
    });
  }

  return prisma.subscription.create({
    data: {
      userId,
      status: SubscriptionStatus.ACTIVE
    }
  });
};
