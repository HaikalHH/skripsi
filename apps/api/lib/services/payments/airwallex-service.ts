import crypto from "node:crypto";
import { env } from "@/lib/env";

type AirwallexAccessTokenResponse = {
  token?: string;
  expires_in?: number;
  expires_at?: string;
};

type AirwallexBillingCheckoutResponse = {
  id?: string;
  url?: string;
  checkout_url?: string;
  status?: string;
  customer_id?: string;
  subscription_id?: string;
  expires_at?: string;
};

type AirwallexWebhookEnvelope = {
  id?: string;
  name?: string;
  type?: string;
  data?: Record<string, unknown> | null;
};

const AIRWALLEX_API_BASE_URL =
  env.AIRWALLEX_ENVIRONMENT === "prod"
    ? "https://api.airwallex.com"
    : "https://api-demo.airwallex.com";
const AIRWALLEX_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

let cachedAccessToken:
  | {
      value: string;
      expiresAt: number;
    }
  | null = null;

const getMissingConfigKeys = () =>
  [
    ["AIRWALLEX_CLIENT_ID", env.AIRWALLEX_CLIENT_ID],
    ["AIRWALLEX_API_KEY", env.AIRWALLEX_API_KEY],
    ["AIRWALLEX_LEGAL_ENTITY_ID", env.AIRWALLEX_LEGAL_ENTITY_ID],
    ["AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID", env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID],
    ["AIRWALLEX_SUBSCRIPTION_PRICE_ID", env.AIRWALLEX_SUBSCRIPTION_PRICE_ID]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

export const isAirwallexConfigured = () => getMissingConfigKeys().length === 0;

export const assertAirwallexConfigured = () => {
  const missingKeys = getMissingConfigKeys();
  if (!missingKeys.length) return;
  throw new Error(
    `Airwallex belum siap. Isi env berikut dulu: ${missingKeys.join(", ")}`
  );
};

const parseIsoDate = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getAirwallexAccessToken = async () => {
  assertAirwallexConfigured();

  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 30_000) {
    return cachedAccessToken.value;
  }

  const response = await fetch(`${AIRWALLEX_API_BASE_URL}/api/v1/authentication/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.AIRWALLEX_API_KEY,
      "x-client-id": env.AIRWALLEX_CLIENT_ID,
      ...(env.AIRWALLEX_ACCOUNT_ID ? { "x-login-as": env.AIRWALLEX_ACCOUNT_ID } : {})
    },
    body: "{}",
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airwallex auth gagal: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as AirwallexAccessTokenResponse;
  if (!data.token) {
    throw new Error("Airwallex auth gagal: token tidak ditemukan.");
  }

  const expiresAt =
    parseIsoDate(data.expires_at)?.getTime() ??
    now + Math.max(60, data.expires_in ?? 30 * 60) * 1000;

  cachedAccessToken = {
    value: data.token,
    expiresAt
  };

  return data.token;
};

const airwallexApiFetch = async <T>(
  path: string,
  init: RequestInit & { json?: unknown }
): Promise<T> => {
  const accessToken = await getAirwallexAccessToken();
  const response = await fetch(`${AIRWALLEX_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {})
    },
    body:
      Object.prototype.hasOwnProperty.call(init, "json") && init.json !== undefined
        ? JSON.stringify(init.json)
        : init.body,
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airwallex request gagal: ${response.status} ${errorText}`);
  }

  return (await response.json()) as T;
};

const buildTrialEndsAt = () => {
  const days = env.AIRWALLEX_SUBSCRIPTION_TRIAL_DAYS;
  if (!days || days <= 0) return null;

  const target = new Date();
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().replace(/\.\d{3}Z$/, "+0000");
};

export const createAirwallexSubscriptionCheckout = async (params: {
  requestId: string;
  successUrl: string;
  backUrl: string;
  merchantCustomerId: string;
  customerEmail?: string | null;
  customerName?: string | null;
  quantity?: number;
}) => {
  const trialEndsAt = buildTrialEndsAt();
  const buildCheckoutPayload = (backField: "back_url" | "cancel_url") => ({
    legal_entity_id: env.AIRWALLEX_LEGAL_ENTITY_ID,
    linked_payment_account_id: env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID,
    customer_data: {
      merchant_customer_id: params.merchantCustomerId,
      ...(params.customerEmail ? { email: params.customerEmail } : {}),
      ...(params.customerName ? { name: params.customerName } : {})
    },
    line_items: [
      {
        price_id: env.AIRWALLEX_SUBSCRIPTION_PRICE_ID,
        quantity: params.quantity ?? 1
      }
    ],
    mode: "SUBSCRIPTION",
    request_id: params.requestId,
    ...(trialEndsAt
      ? {
          subscription_data: {
            trial_ends_at: trialEndsAt
          }
        }
      : {}),
    success_url: params.successUrl,
    [backField]: params.backUrl
  });

  let data: AirwallexBillingCheckoutResponse;
  try {
    data = await airwallexApiFetch<AirwallexBillingCheckoutResponse>(
      "/api/v1/billing_checkouts/create",
      {
        method: "POST",
        json: buildCheckoutPayload("back_url")
      }
    );
  } catch {
    // Airwallex examples still show `cancel_url` in some pages; retry once for compatibility.
    data = await airwallexApiFetch<AirwallexBillingCheckoutResponse>(
      "/api/v1/billing_checkouts/create",
      {
        method: "POST",
        json: buildCheckoutPayload("cancel_url")
      }
    );
  }

  const checkoutUrl = data.url ?? data.checkout_url ?? null;
  if (!data.id || !checkoutUrl) {
    throw new Error("Airwallex checkout create gagal: id/url tidak ditemukan.");
  }

  return {
    id: data.id,
    url: checkoutUrl,
    status: data.status ?? "CREATED",
    customerId: data.customer_id ?? null,
    subscriptionId: data.subscription_id ?? null,
    expiresAt: parseIsoDate(data.expires_at)
  };
};

const safeTimingEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyAirwallexWebhookSignature = (params: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
}) => {
  if (!env.AIRWALLEX_WEBHOOK_SECRET) {
    return true;
  }

  if (!params.timestamp || !params.signature) {
    return false;
  }

  const timestampNumber = Number(params.timestamp);
  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  const ageMs = Math.abs(Date.now() - timestampNumber);
  if (ageMs > AIRWALLEX_WEBHOOK_TOLERANCE_MS) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", env.AIRWALLEX_WEBHOOK_SECRET)
    .update(`${params.timestamp}${params.rawBody}`)
    .digest("hex");

  return safeTimingEqual(expected, params.signature);
};

export const parseAirwallexWebhook = (payload: unknown) => {
  const event = (payload ?? {}) as AirwallexWebhookEnvelope;
  const eventType = event.name ?? event.type ?? "";
  const rawData = event.data ?? null;
  const data =
    rawData &&
    typeof rawData === "object" &&
    "object" in rawData &&
    rawData.object &&
    typeof rawData.object === "object"
      ? (rawData.object as Record<string, unknown>)
      : (rawData as Record<string, unknown> | null);

  return {
    providerEventId: typeof event.id === "string" ? event.id : null,
    eventType,
    data
  };
};
