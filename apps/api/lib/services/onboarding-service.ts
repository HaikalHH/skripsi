import { OnboardingStep, RegistrationStatus, type User } from "@prisma/client";
import { prisma } from "../prisma";
import { buildDummyPaymentLink, createOrGetPendingPaymentSession } from "./payment-service";

const REGISTER_PROMPT = "Nomor Anda belum terdaftar. Ketik `register` untuk mulai registrasi.";

const parseAmount = (raw: string): number | null => {
  const digitsOnly = raw.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;
  const amount = Number(digitsOnly);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};

const askQuestionByStep = (step: OnboardingStep): string => {
  if (step === OnboardingStep.WAIT_REGISTER) {
    return REGISTER_PROMPT;
  }

  if (step === OnboardingStep.ASK_NAME) {
    return "Pertanyaan 1/4: nama lengkap Anda siapa?";
  }

  if (step === OnboardingStep.ASK_CURRENCY) {
    return "Pertanyaan 2/4: mata uang utama Anda apa?\nBalas: `IDR` atau `USD`.";
  }

  if (step === OnboardingStep.ASK_MONTHLY_BUDGET) {
    return "Pertanyaan 3/4: target budget bulanan Anda berapa?\nContoh: `3000000`";
  }

  if (step === OnboardingStep.ASK_SAVINGS_TARGET) {
    return "Pertanyaan 4/4: target tabungan Anda berapa?\nContoh: `10000000`";
  }

  return "Registrasi sudah selesai.";
};

const isRegisterCommand = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized === "register" || normalized === "/register";
};

type OnboardingResult = {
  handled: boolean;
  replyText: string;
};

export const handleOnboarding = async (params: {
  user: User;
  isNew: boolean;
  messageType: "TEXT" | "IMAGE";
  text: string | undefined;
}): Promise<OnboardingResult> => {
  if (params.user.registrationStatus === RegistrationStatus.COMPLETED) {
    return { handled: false, replyText: "" };
  }

  if (params.messageType !== "TEXT") {
    if (params.user.onboardingStep === OnboardingStep.WAIT_REGISTER) {
      return {
        handled: true,
        replyText: REGISTER_PROMPT
      };
    }

    return {
      handled: true,
      replyText: "Registrasi awal hanya bisa via teks.\n" + askQuestionByStep(params.user.onboardingStep)
    };
  }

  const text = (params.text ?? "").trim();
  const step = params.user.onboardingStep;

  if (!text) {
    if (step === OnboardingStep.WAIT_REGISTER) {
      return {
        handled: true,
        replyText: REGISTER_PROMPT
      };
    }

    return {
      handled: true,
      replyText: askQuestionByStep(step)
    };
  }

  if (step === OnboardingStep.WAIT_REGISTER) {
    if (!isRegisterCommand(text)) {
      return {
        handled: true,
        replyText: REGISTER_PROMPT
      };
    }

    await prisma.user.update({
      where: { id: params.user.id },
      data: {
        onboardingStep: OnboardingStep.ASK_NAME
      }
    });

    return {
      handled: true,
      replyText: "Registrasi dimulai.\n" + askQuestionByStep(OnboardingStep.ASK_NAME)
    };
  }

  if (text.startsWith("/")) {
    if (isRegisterCommand(text)) {
      return {
        handled: true,
        replyText: askQuestionByStep(step)
      };
    }

    return {
      handled: true,
      replyText:
        "Perintah belum bisa dipakai sebelum registrasi selesai.\n" + askQuestionByStep(step)
    };
  }

  if (step === OnboardingStep.ASK_NAME) {
    if (text.length < 2) {
      return {
        handled: true,
        replyText: "Nama terlalu pendek.\n" + askQuestionByStep(OnboardingStep.ASK_NAME)
      };
    }

    await prisma.user.update({
      where: { id: params.user.id },
      data: {
        name: text,
        onboardingStep: OnboardingStep.ASK_CURRENCY
      }
    });

    return {
      handled: true,
      replyText: askQuestionByStep(OnboardingStep.ASK_CURRENCY)
    };
  }

  if (step === OnboardingStep.ASK_CURRENCY) {
    const currency = text.toUpperCase();
    if (!["IDR", "USD"].includes(currency)) {
      return {
        handled: true,
        replyText: "Format mata uang belum valid.\nBalas `IDR` atau `USD`."
      };
    }

    await prisma.user.update({
      where: { id: params.user.id },
      data: {
        currency,
        onboardingStep: OnboardingStep.ASK_MONTHLY_BUDGET
      }
    });

    return {
      handled: true,
      replyText: askQuestionByStep(OnboardingStep.ASK_MONTHLY_BUDGET)
    };
  }

  if (step === OnboardingStep.ASK_MONTHLY_BUDGET) {
    const monthlyBudget = parseAmount(text);
    if (!monthlyBudget) {
      return {
        handled: true,
        replyText: "Budget bulanan belum valid.\nContoh balasan: `3000000`"
      };
    }

    await prisma.user.update({
      where: { id: params.user.id },
      data: {
        monthlyBudget,
        onboardingStep: OnboardingStep.ASK_SAVINGS_TARGET
      }
    });

    return {
      handled: true,
      replyText: askQuestionByStep(OnboardingStep.ASK_SAVINGS_TARGET)
    };
  }

  if (step === OnboardingStep.ASK_SAVINGS_TARGET) {
    const targetAmount = parseAmount(text);
    if (!targetAmount) {
      return {
        handled: true,
        replyText: "Target tabungan belum valid.\nContoh balasan: `10000000`"
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: params.user.id },
        data: {
          registrationStatus: RegistrationStatus.COMPLETED,
          onboardingStep: OnboardingStep.COMPLETED,
          onboardingCompletedAt: new Date()
        }
      });

      await tx.savingsGoal.upsert({
        where: { userId: params.user.id },
        update: { targetAmount },
        create: {
          userId: params.user.id,
          targetAmount,
          currentProgress: 0
        }
      });
    });

    const payment = await createOrGetPendingPaymentSession(params.user.id);
    const paymentLink = buildDummyPaymentLink(payment.token);

    return {
      handled: true,
      replyText: [
        "Registrasi selesai.",
        "Langkah berikutnya: aktivasi subscription dengan pembayaran dummy.",
        `Nominal dummy: ${Number(payment.amount).toFixed(0)} ${params.user.currency}`,
        `Link pembayaran: ${paymentLink}`,
        "Setelah klik Paid di web, bot akan kirim notifikasi otomatis."
      ].join("\n")
    };
  }

  const pendingPayment = await createOrGetPendingPaymentSession(params.user.id);
  return {
    handled: true,
    replyText: `Registrasi sudah selesai. Selesaikan pembayaran di ${buildDummyPaymentLink(
      pendingPayment.token
    )}`
  };
};

export const buildSubscriptionRequiredText = async (userId: string) => {
  const payment = await createOrGetPendingPaymentSession(userId);
  const link = buildDummyPaymentLink(payment.token);
  return [
    "Subscription Anda belum aktif.",
    `Silakan selesaikan pembayaran dummy di: ${link}`,
    "Setelah status paid, bot akan mengirim notifikasi aktivasi."
  ].join("\n");
};
