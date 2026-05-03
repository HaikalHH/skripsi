import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const envMock = {
    PAYMENT_PROVIDER: "AIRWALLEX",
    PAYMENT_DEFAULT_AMOUNT: 49_000,
    PAYMENT_WEB_BASE_URL: "https://pay.example.com",
    AIRWALLEX_SUBSCRIPTION_PRICE_ID: "price_basic_monthly"
  };

  const store = {
    users: [] as any[],
    paymentSessions: [] as any[],
    subscriptions: [] as any[],
    outboundMessages: [] as any[],
    paymentProviderEvents: [] as any[]
  };

  const clone = <T>(value: T): T => structuredClone(value);

  const withUser = (session: any) =>
    session
      ? {
          ...session,
          user: store.users.find((user) => user.id === session.userId) ?? null
        }
      : null;

  const sortByCreatedAtDesc = <T extends { createdAt: Date }>(items: T[]) =>
    [...items].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const prismaMock: any = {
    paymentSession: {
      findFirst: async ({ where }: any) => {
        let items = [...store.paymentSessions];
        if (where?.userId) items = items.filter((item) => item.userId === where.userId);
        if (where?.status) items = items.filter((item) => item.status === where.status);
        if (where?.provider) items = items.filter((item) => item.provider === where.provider);
        if (where?.providerCheckoutId) {
          items = items.filter((item) => item.providerCheckoutId === where.providerCheckoutId);
        }
        if (where?.providerSubscriptionId) {
          items = items.filter(
            (item) => item.providerSubscriptionId === where.providerSubscriptionId
          );
        }
        if (where?.providerCustomerId) {
          items = items.filter((item) => item.providerCustomerId === where.providerCustomerId);
        }
        return withUser(sortByCreatedAtDesc(items)[0] ?? null);
      },
      findUnique: async ({ where, include }: any) => {
        const session =
          store.paymentSessions.find((item) => item.id === where?.id) ??
          store.paymentSessions.find((item) => item.token === where?.token) ??
          null;
        return include?.user ? withUser(session) : session;
      },
      create: async ({ data }: any) => {
        const created = {
          id: data.id ?? `ps_${store.paymentSessions.length + 1}`,
          status: data.status ?? "PENDING",
          amount: data.amount,
          currency: data.currency ?? "IDR",
          provider: data.provider ?? "DUMMY",
          providerStatus: data.providerStatus ?? null,
          providerCheckoutId: data.providerCheckoutId ?? null,
          providerSubscriptionId: data.providerSubscriptionId ?? null,
          providerCustomerId: data.providerCustomerId ?? null,
          checkoutUrl: data.checkoutUrl ?? null,
          checkoutExpiresAt: data.checkoutExpiresAt ?? null,
          customerEmail: data.customerEmail ?? null,
          paidAt: data.paidAt ?? null,
          createdAt: data.createdAt ?? new Date("2026-03-19T10:00:00.000Z"),
          updatedAt: data.updatedAt ?? new Date("2026-03-19T10:00:00.000Z"),
          ...data
        };
        store.paymentSessions.push(created);
        return clone(created);
      },
      update: async ({ where, data, include }: any) => {
        const session = store.paymentSessions.find((item) => item.id === where.id);
        if (!session) throw new Error("Payment session not found");
        Object.assign(session, data, {
          updatedAt: new Date("2026-03-19T12:00:00.000Z")
        });
        return include?.user ? withUser(session) : clone(session);
      }
    },
    subscription: {
      findFirst: async ({ where }: any) => {
        let items = [...store.subscriptions];
        if (where?.userId) items = items.filter((item) => item.userId === where.userId);
        if (where?.providerSubscriptionId) {
          items = items.filter(
            (item) => item.providerSubscriptionId === where.providerSubscriptionId
          );
        }
        return sortByCreatedAtDesc(items)[0] ?? null;
      },
      create: async ({ data }: any) => {
        const created = {
          id: data.id ?? `sub_${store.subscriptions.length + 1}`,
          createdAt: data.createdAt ?? new Date("2026-03-19T10:00:00.000Z"),
          updatedAt: data.updatedAt ?? new Date("2026-03-19T10:00:00.000Z"),
          providerStatus: null,
          providerSubscriptionId: null,
          providerCustomerId: null,
          providerPriceId: null,
          currentPeriodStartAt: null,
          currentPeriodEndAt: null,
          cancelAt: null,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          ...data
        };
        store.subscriptions.push(created);
        return clone(created);
      },
      update: async ({ where, data }: any) => {
        const subscription = store.subscriptions.find((item) => item.id === where.id);
        if (!subscription) throw new Error("Subscription not found");
        Object.assign(subscription, data, {
          updatedAt: new Date("2026-03-19T12:00:00.000Z")
        });
        return clone(subscription);
      }
    },
    outboundMessage: {
      findFirst: async ({ where }: any) =>
        store.outboundMessages.find(
          (item) =>
            item.userId === where.userId &&
            item.messageText.startsWith(where.messageText.startsWith) &&
            where.status.in.includes(item.status)
        ) ?? null,
      create: async ({ data }: any) => {
        const created = {
          id: data.id ?? `out_${store.outboundMessages.length + 1}`,
          status: data.status ?? "PENDING",
          createdAt: new Date("2026-03-19T12:00:00.000Z"),
          ...data
        };
        store.outboundMessages.push(created);
        return clone(created);
      }
    },
    paymentProviderEvent: {
      findUnique: async ({ where }: any) =>
        store.paymentProviderEvents.find(
          (item) =>
            item.provider === where.provider_providerEventId.provider &&
            item.providerEventId === where.provider_providerEventId.providerEventId
        ) ?? null,
      create: async ({ data }: any) => {
        const created = {
          id: data.id ?? `evt_${store.paymentProviderEvents.length + 1}`,
          createdAt: new Date("2026-03-19T12:00:00.000Z"),
          processedAt: new Date("2026-03-19T12:00:00.000Z"),
          ...data
        };
        store.paymentProviderEvents.push(created);
        return clone(created);
      }
    },
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(prismaMock)
  };

  const createAirwallexSubscriptionCheckoutMock = vi.fn(
    async ({ requestId, customerEmail }: any) => ({
      id: "chk_123",
      url: "https://checkout.airwallex.test/chk_123",
      status: "ACTIVE",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      expiresAt: new Date("2026-03-19T13:00:00.000Z"),
      requestId,
      customerEmail
    })
  );

  return { envMock, store, prismaMock, createAirwallexSubscriptionCheckoutMock };
});

vi.mock("@/lib/env", () => ({
  env: hoisted.envMock
}));

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

vi.mock("@/lib/services/messaging/outbound-message-service", () => ({
  toSafeOutboundMessageText: vi.fn((text: string) => text)
}));

vi.mock("@/lib/services/payments/airwallex-service", () => ({
  createAirwallexSubscriptionCheckout: hoisted.createAirwallexSubscriptionCheckoutMock,
  isAirwallexConfigured: vi.fn(() => true),
  parseAirwallexWebhook: vi.fn((payload: any) => payload)
}));

import {
  confirmPaymentByToken,
  initializePaymentSessionCheckout,
  processAirwallexBillingWebhook
} from "@/lib/services/payments/payment-service";

const seedStore = () => {
  hoisted.envMock.PAYMENT_PROVIDER = "AIRWALLEX";
  hoisted.store.users = [
    {
      id: "user_1",
      name: "Boss User",
      waNumber: "6281234567890"
    }
  ];
  hoisted.store.paymentSessions = [
    {
      id: "ps_1",
      userId: "user_1",
      token: "pay_token_1",
      amount: 49_000,
      currency: "IDR",
      provider: "AIRWALLEX",
      status: "PENDING",
      providerStatus: null,
      providerCheckoutId: null,
      providerSubscriptionId: null,
      providerCustomerId: null,
      checkoutUrl: null,
      checkoutExpiresAt: null,
      customerEmail: null,
      paidAt: null,
      createdAt: new Date("2026-03-19T10:00:00.000Z"),
      updatedAt: new Date("2026-03-19T10:00:00.000Z")
    }
  ];
  hoisted.store.subscriptions = [];
  hoisted.store.outboundMessages = [];
  hoisted.store.paymentProviderEvents = [];
  hoisted.createAirwallexSubscriptionCheckoutMock.mockClear();
};

describe("payment service", () => {
  beforeEach(() => {
    seedStore();
  });

  it("initializes hosted checkout and persists provider checkout details", async () => {
    const session = await initializePaymentSessionCheckout({
      token: "pay_token_1",
      customerEmail: "boss@example.com"
    });

    expect(hoisted.createAirwallexSubscriptionCheckoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "pay_token_1",
        customerEmail: "boss@example.com",
        successUrl: "https://pay.example.com/pay/pay_token_1?checkout=success",
        backUrl: "https://pay.example.com/pay/pay_token_1?checkout=cancel"
      })
    );
    expect(session.providerCheckoutId).toBe("chk_123");
    expect(session.providerCustomerId).toBe("cus_123");
    expect(session.providerSubscriptionId).toBe("sub_123");
    expect(session.checkoutUrl).toBe("https://checkout.airwallex.test/chk_123");
    expect(session.customerEmail).toBe("boss@example.com");
  });

  it("disables manual confirm when session provider is Airwallex", async () => {
    await expect(confirmPaymentByToken("pay_token_1")).rejects.toThrow(
      "Konfirmasi manual dimatikan untuk Airwallex"
    );
  });

  it("marks session paid from webhook and ignores duplicate provider events", async () => {
    const first = await processAirwallexBillingWebhook({
      providerEventId: "evt_awx_1",
      eventType: "subscription.active",
      data: {
        id: "sub_123",
        request_id: "pay_token_1",
        customer_id: "cus_123",
        status: "ACTIVE",
        current_period_start_at: "2026-03-19T00:00:00.000Z",
        current_period_end_at: "2026-04-19T00:00:00.000Z"
      }
    });

    expect(first).toEqual({
      duplicate: false,
      eventType: "subscription.active",
      paymentSessionToken: "pay_token_1",
      userId: "user_1"
    });
    expect(hoisted.store.paymentSessions[0].status).toBe("PAID");
    expect(hoisted.store.paymentSessions[0].providerSubscriptionId).toBe("sub_123");
    expect(hoisted.store.paymentSessions[0].providerCustomerId).toBe("cus_123");
    expect(hoisted.store.subscriptions).toHaveLength(1);
    expect(hoisted.store.subscriptions[0].status).toBe("ACTIVE");
    expect(hoisted.store.subscriptions[0].providerPriceId).toBe("price_basic_monthly");
    expect(hoisted.store.outboundMessages).toHaveLength(1);
    expect(hoisted.store.paymentProviderEvents).toHaveLength(1);

    const second = await processAirwallexBillingWebhook({
      providerEventId: "evt_awx_1",
      eventType: "subscription.active",
      data: {
        id: "sub_123",
        request_id: "pay_token_1",
        customer_id: "cus_123",
        status: "ACTIVE"
      }
    });

    expect(second).toEqual({
      duplicate: true,
      eventType: "subscription.active"
    });
    expect(hoisted.store.outboundMessages).toHaveLength(1);
    expect(hoisted.store.paymentProviderEvents).toHaveLength(1);
  });
});
