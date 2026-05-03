import crypto from "node:crypto";
import {
  OutboundMessageStatus,
  PaymentSessionStatus,
  Prisma,
  SubscriptionStatus
} from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { toSafeOutboundMessageText } from "@/lib/services/messaging/outbound-message-service";
import {
  createAirwallexSubscriptionCheckout,
  isAirwallexConfigured,
  parseAirwallexWebhook
} from "@/lib/services/payments/airwallex-service";

type PaymentProviderValue = "DUMMY" | "AIRWALLEX";

const ACTIVATION_NOTIFICATION_TEXT =
  "Pembayaran berhasil dikonfirmasi. Subscription Anda sudah aktif, sekarang bot bisa dipakai.";
const ACTIVATION_NOTIFICATION_PREFIX = "Pembayaran berhasil dikonfirmasi.";

const generatePaymentToken = () => crypto.randomUUID().replaceAll("-", "");

const getConfiguredPaymentProvider = (): PaymentProviderValue =>
  env.PAYMENT_PROVIDER === "AIRWALLEX" ? "AIRWALLEX" : "DUMMY";

const buildPaymentPageLink = (token: string) => `${env.PAYMENT_WEB_BASE_URL}/pay/${token}`;

// Backward-compatible export name used by onboarding flow/tests.
export const buildDummyPaymentLink = (token: string) => buildPaymentPageLink(token);

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const getPaymentProviderEventModel = (client: unknown) =>
  (client as {
    paymentProviderEvent?: {
      findUnique: (args: unknown) => Promise<{ id: string } | null>;
      create: (args: unknown) => Promise<unknown>;
    };
  }).paymentProviderEvent;

const isProviderEventDuplicateError = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target =
    Array.isArray(error.meta?.target)
      ? error.meta.target
      : typeof error.meta?.target === "string"
        ? [error.meta.target]
        : [];

  return target.includes("provider") && target.includes("providerEventId");
};

const ensureActivationNotificationQueued = async (
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    waNumber: string;
  }
) => {
  const existing = await tx.outboundMessage.findFirst({
    where: {
      userId: params.userId,
      messageText: { startsWith: ACTIVATION_NOTIFICATION_PREFIX },
      status: {
        in: [
          OutboundMessageStatus.PENDING,
          OutboundMessageStatus.PROCESSING,
          OutboundMessageStatus.SENT
        ]
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

const ensureLatestSubscriptionState = async (
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    provider: PaymentProviderValue;
    status: SubscriptionStatus;
    providerSubscriptionId?: string | null;
    providerCustomerId?: string | null;
    providerPriceId?: string | null;
    providerStatus?: string | null;
    currentPeriodStartAt?: Date | null;
    currentPeriodEndAt?: Date | null;
    cancelAt?: Date | null;
    cancelAtPeriodEnd?: boolean;
    cancelledAt?: Date | null;
  }
) => {
  const subscriptionModel = tx.subscription as typeof tx.subscription & {
    findFirst: (args: unknown) => Promise<any>;
    create: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
  };

  const existing =
    (params.providerSubscriptionId
      ? await subscriptionModel.findFirst({
          where: {
            providerSubscriptionId: params.providerSubscriptionId
          }
        })
      : null) ??
    (await subscriptionModel.findFirst({
      where: { userId: params.userId },
      orderBy: { createdAt: "desc" }
    }));

  const data = {
    status: params.status,
    provider: params.provider,
    providerSubscriptionId: params.providerSubscriptionId ?? existing?.providerSubscriptionId ?? null,
    providerCustomerId: params.providerCustomerId ?? existing?.providerCustomerId ?? null,
    providerPriceId: params.providerPriceId ?? existing?.providerPriceId ?? null,
    providerStatus: params.providerStatus ?? existing?.providerStatus ?? null,
    currentPeriodStartAt:
      params.currentPeriodStartAt ?? existing?.currentPeriodStartAt ?? null,
    currentPeriodEndAt: params.currentPeriodEndAt ?? existing?.currentPeriodEndAt ?? null,
    cancelAt: params.cancelAt ?? existing?.cancelAt ?? null,
    cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd ?? false,
    cancelledAt: params.cancelledAt ?? existing?.cancelledAt ?? null
  };

  if (existing) {
    return subscriptionModel.update({
      where: { id: existing.id },
      data
    });
  }

  return subscriptionModel.create({
    data: {
      userId: params.userId,
      ...data
    }
  });
};

const markPaymentSessionPaid = async (
  tx: Prisma.TransactionClient,
  params: {
    sessionId: string;
    userId: string;
    waNumber: string;
    provider: PaymentProviderValue;
    providerSubscriptionId?: string | null;
    providerCustomerId?: string | null;
    providerStatus?: string | null;
    providerPriceId?: string | null;
    currentPeriodStartAt?: Date | null;
    currentPeriodEndAt?: Date | null;
    cancelAt?: Date | null;
    cancelAtPeriodEnd?: boolean;
    cancelledAt?: Date | null;
  }
) => {
  const paymentSessionModel = tx.paymentSession as typeof tx.paymentSession & {
    findUnique: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
  };
  const existingSession = await paymentSessionModel.findUnique({
    where: { id: params.sessionId }
  });

  const paidSession = await paymentSessionModel.update({
    where: { id: params.sessionId },
    data: {
      status: PaymentSessionStatus.PAID,
      paidAt: existingSession?.paidAt ?? new Date(),
      provider: params.provider,
      providerSubscriptionId: params.providerSubscriptionId ?? null,
      providerCustomerId: params.providerCustomerId ?? null,
      providerStatus: params.providerStatus ?? "ACTIVE"
    },
    include: { user: true }
  });

  await ensureLatestSubscriptionState(tx, {
    userId: params.userId,
    provider: params.provider,
    status: SubscriptionStatus.ACTIVE,
    providerSubscriptionId: params.providerSubscriptionId,
    providerCustomerId: params.providerCustomerId,
    providerStatus: params.providerStatus ?? "ACTIVE",
    providerPriceId: params.providerPriceId,
    currentPeriodStartAt: params.currentPeriodStartAt,
    currentPeriodEndAt: params.currentPeriodEndAt,
    cancelAt: params.cancelAt,
    cancelAtPeriodEnd: params.cancelAtPeriodEnd,
    cancelledAt: params.cancelledAt
  });

  await ensureActivationNotificationQueued(tx, {
    userId: params.userId,
    waNumber: params.waNumber
  });

  return paidSession;
};

export const createOrGetPendingPaymentSession = async (
  userId: string,
  amount = env.PAYMENT_DEFAULT_AMOUNT
) => {
  const provider = getConfiguredPaymentProvider();
  const existing = await prisma.paymentSession.findFirst({
    where: {
      userId,
      status: PaymentSessionStatus.PENDING,
      provider
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
      amount,
      currency: "IDR",
      provider
    }
  });
};

export const getPaymentSessionByToken = async (token: string) =>
  prisma.paymentSession.findUnique({
    where: { token },
    include: { user: true }
  });

const shouldRecreateAirwallexCheckout = (session: {
  checkoutUrl?: string | null;
  checkoutExpiresAt?: Date | null;
  providerStatus?: string | null;
}) => {
  if (!session.checkoutUrl) return true;
  if (session.checkoutExpiresAt && session.checkoutExpiresAt.getTime() <= Date.now()) {
    return true;
  }
  return /cancel/i.test(session.providerStatus ?? "");
};

export const initializePaymentSessionCheckout = async (params: {
  token: string;
  customerEmail?: string | null;
}) => {
  const session = await prisma.paymentSession.findUnique({
    where: { token: params.token },
    include: { user: true }
  });
  if (!session) {
    throw new Error("Payment session not found");
  }

  if (session.status === PaymentSessionStatus.PAID) {
    return session;
  }

  if (session.provider === "DUMMY") {
    return prisma.paymentSession.update({
      where: { id: session.id },
      data: {
        customerEmail: params.customerEmail?.trim() || session.customerEmail || null
      },
      include: { user: true }
    });
  }

  if (!isAirwallexConfigured()) {
    throw new Error("Airwallex env belum lengkap. Checkout belum bisa dibuat.");
  }

  if (!shouldRecreateAirwallexCheckout(session)) {
    if (params.customerEmail?.trim() && params.customerEmail.trim() !== session.customerEmail) {
      return prisma.paymentSession.update({
        where: { id: session.id },
        data: { customerEmail: params.customerEmail.trim() },
        include: { user: true }
      });
    }
    return session;
  }

  const customerEmail = params.customerEmail?.trim() || session.customerEmail || null;
  const checkout = await createAirwallexSubscriptionCheckout({
    requestId: session.token,
    successUrl: `${buildPaymentPageLink(session.token)}?checkout=success`,
    backUrl: `${buildPaymentPageLink(session.token)}?checkout=cancel`,
    merchantCustomerId: session.userId,
    customerEmail,
    customerName: session.user.name ?? undefined
  });

  return prisma.paymentSession.update({
    where: { id: session.id },
    data: {
      customerEmail,
      provider: "AIRWALLEX",
      providerCheckoutId: checkout.id,
      providerCustomerId: checkout.customerId,
      providerSubscriptionId: checkout.subscriptionId,
      providerStatus: checkout.status,
      checkoutUrl: checkout.url,
      checkoutExpiresAt: checkout.expiresAt
    },
    include: { user: true }
  });
};

export const confirmPaymentByToken = async (token: string) =>
  prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    if (session.provider === "AIRWALLEX") {
      throw new Error(
        "Konfirmasi manual dimatikan untuk Airwallex. Tunggu webhook pembayaran masuk."
      );
    }

    if (session.status !== PaymentSessionStatus.PENDING) {
      throw new Error("Payment session is not payable");
    }

    return markPaymentSessionPaid(tx, {
      sessionId: session.id,
      userId: session.userId,
      waNumber: session.user.waNumber,
      provider: "DUMMY",
      providerStatus: "PAID"
    });
  });

const resolveSubscriptionStatusFromProvider = (providerStatus: string | null) => {
  if (!providerStatus) return SubscriptionStatus.INACTIVE;
  const normalized = providerStatus.toUpperCase();
  if (normalized === "ACTIVE") return SubscriptionStatus.ACTIVE;
  if (normalized === "IN_TRIAL" || normalized === "TRIAL") return SubscriptionStatus.TRIAL;
  return SubscriptionStatus.INACTIVE;
};

const extractString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

const extractObject = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const extractDate = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const findPaymentSessionForAirwallexEvent = async (data: Record<string, unknown> | null) => {
  if (!data) return null;

  const requestId = extractString(data.request_id);
  if (requestId) {
    const byRequestId = await prisma.paymentSession.findUnique({
      where: { token: requestId },
      include: { user: true }
    });
    if (byRequestId) return byRequestId;
  }

  const providerCheckoutId =
    extractString(data.id) ??
    extractString(data.billing_checkout_id) ??
    extractString(extractObject(data.checkout)?.id);
  if (providerCheckoutId) {
    const byCheckoutId = await prisma.paymentSession.findFirst({
      where: { providerCheckoutId },
      include: { user: true },
      orderBy: { createdAt: "desc" }
    });
    if (byCheckoutId) return byCheckoutId;
  }

  const providerSubscriptionId =
    extractString(data.subscription_id) ??
    extractString(extractObject(data.subscription)?.id);
  if (providerSubscriptionId) {
    const bySubscriptionId = await prisma.paymentSession.findFirst({
      where: { providerSubscriptionId },
      include: { user: true },
      orderBy: { createdAt: "desc" }
    });
    if (bySubscriptionId) return bySubscriptionId;
  }

  const providerCustomerId =
    extractString(data.customer_id) ??
    extractString(extractObject(data.customer)?.id) ??
    extractString(extractObject(data.customer_data)?.merchant_customer_id) ??
    extractString(extractObject(extractObject(data.customer)?.metadata)?.merchant_customer_id);
  if (providerCustomerId) {
    const byCustomerId = await prisma.paymentSession.findFirst({
      where: { providerCustomerId },
      include: { user: true },
      orderBy: { createdAt: "desc" }
    });
    if (byCustomerId) return byCustomerId;

    const byMerchantCustomerId = await prisma.paymentSession.findFirst({
      where: { userId: providerCustomerId },
      include: { user: true },
      orderBy: { createdAt: "desc" }
    });
    if (byMerchantCustomerId) return byMerchantCustomerId;
  }

  return null;
};

export const processAirwallexBillingWebhook = async (payload: unknown) => {
  const { providerEventId, eventType, data } = parseAirwallexWebhook(payload);
  if (!providerEventId || !eventType) {
    throw new Error("Webhook Airwallex tidak valid.");
  }

  const providerEventModel = getPaymentProviderEventModel(prisma);
  if (providerEventModel) {
    const existingEvent = await providerEventModel.findUnique({
      where: {
        provider_providerEventId: {
          provider: "AIRWALLEX",
          providerEventId
        }
      }
    });
    if (existingEvent) {
      return { duplicate: true as const, eventType };
    }
  }

  const session = await findPaymentSessionForAirwallexEvent(data);
  const subscriptionObject = extractObject(data?.subscription);
  const customerObject = extractObject(data?.customer);
  const priceObject = extractObject(data?.price);
  const providerSubscriptionId =
    extractString(data?.id) && eventType.startsWith("subscription.")
      ? extractString(data?.id)
      : extractString(data?.subscription_id) ??
        extractString(subscriptionObject?.id) ??
        session?.providerSubscriptionId ??
        null;
  const providerCustomerId =
    extractString(data?.customer_id) ??
    extractString(customerObject?.id) ??
    extractString(extractObject(data?.customer_data)?.merchant_customer_id) ??
    session?.providerCustomerId ??
    null;
  const providerStatus =
    extractString(data?.status) ??
    ([
      "invoice.payment.paid",
      "invoice.paid",
      "billing_transaction.succeeded"
    ].includes(eventType)
      ? "ACTIVE"
      : eventType.startsWith("subscription.")
      ? eventType.split(".").at(-1)?.toUpperCase() ?? null
      : null);
  const currentPeriodStartAt =
    extractDate(data?.current_period_start_at) ?? extractDate(data?.period_start_at);
  const currentPeriodEndAt =
    extractDate(data?.current_period_end_at) ?? extractDate(data?.period_end_at);
  const cancelAt = extractDate(data?.cancel_at);
  const cancelAtPeriodEnd = data?.cancel_at_period_end === true;
  const cancelledAt = extractDate(data?.cancel_requested_at) ?? extractDate(data?.cancelled_at);
  const providerPriceId =
    extractString(priceObject?.id) ??
    extractString(extractObject(data?.plan)?.id) ??
    extractString(env.AIRWALLEX_SUBSCRIPTION_PRICE_ID);
  const inferredSubscriptionStatus = resolveSubscriptionStatusFromProvider(providerStatus);

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (
        session &&
        [
          "subscription.active",
          "subscription.in_trial",
          "invoice.payment.paid",
          "invoice.paid",
          "billing_transaction.succeeded"
        ].includes(eventType)
      ) {
        await markPaymentSessionPaid(tx, {
          sessionId: session.id,
          userId: session.userId,
          waNumber: session.user.waNumber,
          provider: "AIRWALLEX",
          providerSubscriptionId,
          providerCustomerId,
          providerStatus,
          providerPriceId,
          currentPeriodStartAt,
          currentPeriodEndAt,
          cancelAt,
          cancelAtPeriodEnd,
          cancelledAt
        });
      } else if (session && ["billing_checkout.cancelled", "billing_checkout.expired"].includes(eventType)) {
        await tx.paymentSession.update({
          where: { id: session.id },
          data: {
            providerStatus: eventType === "billing_checkout.expired" ? "EXPIRED" : "CANCELLED"
          }
        });
      } else if (session && eventType === "billing_checkout.completed") {
        await tx.paymentSession.update({
          where: { id: session.id },
          data: {
            providerStatus: "COMPLETED",
            providerSubscriptionId,
            providerCustomerId
          }
        });
      }

      if (
        session?.userId &&
        eventType.startsWith("subscription.") &&
        !["subscription.active", "subscription.in_trial"].includes(eventType)
      ) {
        await ensureLatestSubscriptionState(tx, {
          userId: session.userId,
          provider: "AIRWALLEX",
          status: inferredSubscriptionStatus,
          providerSubscriptionId,
          providerCustomerId,
          providerPriceId,
          providerStatus,
          currentPeriodStartAt,
          currentPeriodEndAt,
          cancelAt,
          cancelAtPeriodEnd,
          cancelledAt
        });
      }

      const txProviderEventModel = getPaymentProviderEventModel(tx);
      if (txProviderEventModel) {
        await txProviderEventModel.create({
          data: {
            ...(session ? { userId: session.userId } : {}),
            provider: "AIRWALLEX",
            providerEventId,
            eventType,
            payloadJson: payload as Prisma.InputJsonValue
          }
        });
      }

      return {
        duplicate: false as const,
        eventType,
        paymentSessionToken: session?.token ?? null,
        userId: session?.userId ?? null
      };
    });
  } catch (error) {
    if (isProviderEventDuplicateError(error)) {
      return { duplicate: true as const, eventType };
    }
    throw error;
  }
};
