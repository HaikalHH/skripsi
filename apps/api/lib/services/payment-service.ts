import crypto from "node:crypto";
import {
  OutboundMessageStatus,
  PaymentSessionStatus,
  Prisma,
  SubscriptionStatus
} from "@prisma/client";
import { env } from "../env";
import { prisma } from "../prisma";
import { toSafeOutboundMessageText } from "./outbound-message-service";

const DEFAULT_DUMMY_PRICE = 49000;
const ACTIVATION_NOTIFICATION_TEXT =
  "Pembayaran berhasil dikonfirmasi. Subscription Anda sudah aktif, sekarang bot bisa dipakai.";
const ACTIVATION_NOTIFICATION_PREFIX = "Pembayaran berhasil dikonfirmasi.";

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

const ensureActivationNotificationQueued = async (tx: Prisma.TransactionClient, params: {
  userId: string;
  waNumber: string;
}) => {
  const existing = await tx.outboundMessage.findFirst({
    where: {
      userId: params.userId,
      messageText: { startsWith: ACTIVATION_NOTIFICATION_PREFIX },
      status: {
        in: [OutboundMessageStatus.PENDING, OutboundMessageStatus.PROCESSING, OutboundMessageStatus.SENT]
      }
    },
    select: { id: true }
  });

  if (existing) return;

  await tx.outboundMessage.create({
    data: {
      userId: params.userId,
      waNumber: params.waNumber,
      messageText: toSafeOutboundMessageText(ACTIVATION_NOTIFICATION_TEXT)
    }
  });
};

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
      await ensureActivationNotificationQueued(tx, {
        userId: session.userId,
        waNumber: session.user.waNumber
      });
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

    await ensureActivationNotificationQueued(tx, {
      userId: session.userId,
      waNumber: session.user.waNumber
    });

    return paidSession;
  });
