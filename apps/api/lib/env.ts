import { logger } from "@/lib/logger";
import { z } from "zod";
import { optional } from "zod/v4";

const optionalApiKey = z
  .string()
  .optional()
  .default("")
  .transform((value) => value.trim());

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("mysql://finance:finance@localhost:3306/finance_bot"),
  GEMINI_API_KEY: z.string().min(1).default("replace_gemini_api_key"),
  GEMINI_MODEL: z.string().min(1).default("gemini-flash-latest"),
  GCP_VISION_API_KEY: z
    .string()
    .optional()
    .default("./gen-lang-client-0809684499-123cd4748b10.json"),
  GCP_VISION_CREDENTIALS_PATH: z.string().optional().default(""),
  PUBLIC_API_BASE_URL: z.union([z.string().url(), z.literal("")]).default(""),
  REPORTING_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  PAYMENT_WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  PAYMENT_PROVIDER: z.enum(["DUMMY", "AIRWALLEX"]).default("DUMMY"),
  PAYMENT_DEFAULT_AMOUNT: z.coerce.number().positive().default(49_000),
  AIRWALLEX_ENVIRONMENT: z.enum(["demo", "prod"]).default("demo"),
  AIRWALLEX_CLIENT_ID: z.string().optional().default(""),
  AIRWALLEX_API_KEY: z.string().optional().default(""),
  AIRWALLEX_ACCOUNT_ID: z.string().optional().default(""),
  AIRWALLEX_LEGAL_ENTITY_ID: z.string().optional().default(""),
  AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID: z.string().optional().default(""),
  AIRWALLEX_SUBSCRIPTION_PRICE_ID: z.string().optional().default(""),
  AIRWALLEX_SUBSCRIPTION_TRIAL_DAYS: z.coerce.number().int().min(0).default(0),
  AIRWALLEX_WEBHOOK_SECRET: z.string().optional().default(""),
  WHATSAPP_GRAPH_API_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  WHATSAPP_API_VERSION: z.string().min(1).default("v23.0"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(""),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(16).default("change_this_whatsapp_verify_token"),
  WHATSAPP_APP_SECRET: z.string().optional().default(""),
  WHATSAPP_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  WHATSAPP_MEDIA_DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  ADMIN_API_TOKEN: z.string().min(8).default("change_this_admin_api_token"),
  BOT_INTERNAL_TOKEN: z
    .string()
    .min(8)
    .default("change_this_bot_internal_token"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  BOT_HEARTBEAT_STALE_SECONDS: z.coerce.number().int().positive().default(120),
  EMERGENCY_FUND_STABLE_MULTIPLIER: z.coerce.number().positive().default(6),
  EMERGENCY_FUND_UNSTABLE_MULTIPLIER: z.coerce.number().positive().default(9),
  FINANCIAL_FREEDOM_EXPENSE_MULTIPLIER: z.coerce.number().positive().default(25),
  FINNHUB_API_KEY: optionalApiKey,
  GOLDAPI_API_KEY: optionalApiKey,
  MARKETAUX_API_TOKEN: optionalApiKey,
  EXCHANGERATE_API_KEY: optionalApiKey,
});

export const env = envSchema.parse(process.env);

type MarketProviderAvailability = {
  enabled: boolean;
  envKey: keyof typeof env;
  label: string;
};

const buildMarketProviderAvailability = () =>
  ({
    finnhub: {
      enabled: Boolean(env.FINNHUB_API_KEY),
      envKey: "FINNHUB_API_KEY",
      label: "Finnhub market data",
    },
    goldapi: {
      enabled: Boolean(env.GOLDAPI_API_KEY),
      envKey: "GOLDAPI_API_KEY",
      label: "GoldAPI market data",
    },
    marketaux: {
      enabled: Boolean(env.MARKETAUX_API_TOKEN),
      envKey: "MARKETAUX_API_TOKEN",
      label: "Marketaux finance news",
    },
    exchangerateHost: {
      enabled: Boolean(env.EXCHANGERATE_API_KEY),
      envKey: "EXCHANGERATE_API_KEY",
      label: "exchangerate.host forex data",
    },
  }) satisfies Record<string, MarketProviderAvailability>;

export const marketProviderAvailability = buildMarketProviderAvailability();

if (env.NODE_ENV !== "test") {
  for (const availability of Object.values(marketProviderAvailability)) {
    if (availability.enabled) continue;

    logger.warn(
      {
        envKey: availability.envKey,
        provider: availability.label,
      },
      `${availability.label} disabled because ${availability.envKey} is missing. The app will continue with fallback providers when possible.`,
    );
  }
}
