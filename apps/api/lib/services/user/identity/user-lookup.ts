import { OnboardingStatus, OnboardingStep, RegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildWaLookupCandidates,
  isLikelyPhoneNumber,
  normalizeWaFallback,
  normalizeWaNumber
} from "@/lib/services/user/identity/wa-number";

const tryMigrateWaNumber = async (userId: string, preferredWaNumber: string) => {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: { waNumber: preferredWaNumber }
    });
  } catch {
    const collided = await prisma.user.findUnique({
      where: { waNumber: preferredWaNumber }
    });
    return collided ?? null;
  }
};

export const findExistingUserByWaNumber = async (waNumber: string, waLid?: string) => {
  const normalized = normalizeWaNumber(waNumber);
  const candidates = buildWaLookupCandidates(waNumber, normalized, waLid ? [waLid] : []);

  for (const candidate of candidates) {
    const existing = await prisma.user.findUnique({ where: { waNumber: candidate } });
    if (existing) {
      return {
        user: existing,
        normalizedWaNumber: normalizeWaFallback(waNumber)
      };
    }
  }

  return {
    user: null,
    normalizedWaNumber: normalizeWaFallback(waNumber)
  };
};

export const findOrCreateUserByWaNumber = async (waNumber: string, waLid?: string) => {
  const { user: existingUser, normalizedWaNumber: normalized } = await findExistingUserByWaNumber(
    waNumber,
    waLid
  );

  if (existingUser) {
    if (normalized && existingUser.waNumber !== normalized && isLikelyPhoneNumber(normalized)) {
      const migrated = await tryMigrateWaNumber(existingUser.id, normalized);
      if (migrated) {
        return { user: migrated, isNew: false };
      }
    }

    return { user: existingUser, isNew: false };
  }

  const user = await prisma.user.create({
    data: {
      waNumber: normalized,
      registrationStatus: RegistrationStatus.PENDING,
      onboardingStatus: OnboardingStatus.NOT_STARTED,
      onboardingStep: OnboardingStep.WAIT_REGISTER,
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
