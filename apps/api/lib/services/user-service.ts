import { OnboardingStep, RegistrationStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../prisma";

export const findOrCreateUserByWaNumber = async (waNumber: string) => {
  const normalized = waNumber.replace(/\s+/g, "");
  const existing = await prisma.user.findUnique({ where: { waNumber: normalized } });
  if (existing) return { user: existing, isNew: false };

  const user = await prisma.user.create({
    data: {
      waNumber: normalized,
      registrationStatus: RegistrationStatus.PENDING,
      onboardingStep: OnboardingStep.WAIT_REGISTER,
      subscriptions: {
        create: {
          status: SubscriptionStatus.INACTIVE
        }
      },
      savingsGoal: {
        create: {
          targetAmount: 0,
          currentProgress: 0
        }
      }
    }
  });

  return { user, isNew: true };
};
