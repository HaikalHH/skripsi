import { OnboardingStatus, OnboardingStep, RegistrationStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const stripWhitespace = (value: string) => value.replace(/\s+/g, "");

const extractJidUserPart = (value: string) => {
  const trimmed = value.trim();
  const withoutDomain = trimmed.split("@")[0] ?? trimmed;
  return withoutDomain.split(":")[0] ?? withoutDomain;
};

const digitsOnly = (value: string) => value.replace(/\D+/g, "");
const isLikelyPhoneNumber = (value: string) => /^62\d{7,15}$/.test(value);

export const normalizeWaNumber = (waNumber: string): string => {
  const userPart = extractJidUserPart(waNumber);
  const digits = digitsOnly(userPart);
  if (!digits) {
    return stripWhitespace(userPart);
  }

  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }

  if (digits.startsWith("8")) {
    return `62${digits}`;
  }

  return digits;
};

const pushCandidate = (list: string[], seen: Set<string>, value: string) => {
  const normalized = stripWhitespace(value);
  if (!normalized || normalized.length < 6 || seen.has(normalized)) return;
  seen.add(normalized);
  list.push(normalized);
};

const buildWaLookupCandidates = (
  rawWaNumber: string,
  normalizedWaNumber: string,
  aliases: string[] = []
) => {
  const userPart = extractJidUserPart(rawWaNumber);
  const digits = digitsOnly(userPart);

  const candidates: string[] = [];
  const seen = new Set<string>();

  pushCandidate(candidates, seen, normalizedWaNumber);
  pushCandidate(candidates, seen, rawWaNumber);
  pushCandidate(candidates, seen, userPart);

  for (const alias of aliases) {
    const normalizedAlias = normalizeWaNumber(alias);
    pushCandidate(candidates, seen, alias);
    pushCandidate(candidates, seen, normalizedAlias);
    pushCandidate(candidates, seen, extractJidUserPart(alias));
  }

  if (digits) {
    pushCandidate(candidates, seen, digits);

    if (digits.startsWith("0")) {
      pushCandidate(candidates, seen, `62${digits.slice(1)}`);
      pushCandidate(candidates, seen, digits.slice(1));
    }

    if (digits.startsWith("62")) {
      const rest = digits.slice(2);
      pushCandidate(candidates, seen, `0${rest}`);
      pushCandidate(candidates, seen, rest);
    }

    if (digits.startsWith("8")) {
      pushCandidate(candidates, seen, `62${digits}`);
    }
  }

  return candidates;
};

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

export const findOrCreateUserByWaNumber = async (waNumber: string, waLid?: string) => {
  const normalized = normalizeWaNumber(waNumber);
  const candidates = buildWaLookupCandidates(waNumber, normalized, waLid ? [waLid] : []);

  for (const candidate of candidates) {
    const existing = await prisma.user.findUnique({ where: { waNumber: candidate } });
    if (!existing) continue;

    if (normalized && existing.waNumber !== normalized && isLikelyPhoneNumber(normalized)) {
      const migrated = await tryMigrateWaNumber(existing.id, normalized);
      if (migrated) {
        return { user: migrated, isNew: false };
      }
    }

    return { user: existing, isNew: false };
  }

  const waNumberToStore = normalized || stripWhitespace(waNumber);

  const user = await prisma.user.create({
    data: {
      waNumber: waNumberToStore,
      registrationStatus: RegistrationStatus.PENDING,
      onboardingStatus: OnboardingStatus.NOT_STARTED,
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

