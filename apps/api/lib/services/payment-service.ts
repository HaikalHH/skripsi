import crypto from "node:crypto";
import { PaymentSessionStatus, SubscriptionStatus } from "@prisma/client";
import { env } from "../env";
import { prisma } from "../prisma";

const DEFAULT_DUMMY_PRICE = 49000;

const generatePaymentToken = () => crypto.randomUUID().replaceAll("-", "");

export const buildDummyPaymentLink = (token: string): string =>
  `${env.PAYMENT_WEB_BASE_URL}/pay/${token}`;

export const createOrGetPendingPaymentSession = async (
  userId: string,
  amount = DEFAULT_DUMMY_PRICE
) => {
  const existing = await prisma.paymentSession.findFirst({
    where: {
      userId,
      status: PaymentSessionStatus.PENDING
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return existing;
  }

  return prisma.paymentSession.create({
    data: {
      userId,
      token: generatePaymentToken(),
      amount
    }
  });
};

export const getPaymentSessionByToken = async (token: string) =>
  prisma.paymentSession.findUnique({
    where: { token },
    include: { user: true }
  });

export const confirmPaymentByToken = async (token: string) =>
  prisma.$transaction(async (tx) => {
    const session = await tx.paymentSession.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!session) {
      throw new Error("Payment session not found");
    }

    if (session.status === PaymentSessionStatus.PAID) {
      return session;
    }

    if (session.status !== PaymentSessionStatus.PENDING) {
      throw new Error("Payment session is not payable");
    }

    const paidSession = await tx.paymentSession.update({
      where: { id: session.id },
      data: {
        status: PaymentSessionStatus.PAID,
        paidAt: new Date()
      },
      include: { user: true }
    });

    const latestSubscription = await tx.subscription.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" }
    });

    if (latestSubscription) {
      await tx.subscription.update({
        where: { id: latestSubscription.id },
        data: { status: SubscriptionStatus.ACTIVE }
      });
    } else {
      await tx.subscription.create({
        data: {
          userId: session.userId,
          status: SubscriptionStatus.ACTIVE
        }
      });
    }

    await tx.outboundMessage.create({
      data: {
        userId: session.userId,
        waNumber: session.user.waNumber,
        messageText:
          "Pembayaran berhasil dikonfirmasi. Subscription Anda sudah aktif, sekarang bot bisa dipakai."
      }
    });

    return paidSession;
  });
