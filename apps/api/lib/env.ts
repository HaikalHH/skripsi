import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("mysql://finance:finance@localhost:3306/finance_bot"),
  GEMINI_API_KEY: z.string().min(1).default("replace_gemini_api_key"),
  GEMINI_MODEL: z.string().min(1).default("gemini-flash-latest"),
  GCP_VISION_API_KEY: z.string().min(1).default("replace_vision_api_key"),
  REPORTING_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  PAYMENT_WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_API_TOKEN: z.string().min(8).default("change_this_admin_api_token"),
  BOT_INTERNAL_TOKEN: z.string().min(8).default("change_this_bot_internal_token"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  BOT_HEARTBEAT_STALE_SECONDS: z.coerce.number().int().positive().default(120)
});

export const env = envSchema.parse(process.env);
