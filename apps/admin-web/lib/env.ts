import { z } from "zod";

const envSchema = z.object({
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  ADMIN_API_TOKEN: z.string().min(8).default("change_this_admin_api_token"),
  ADMIN_PASSWORD: z.string().min(4).default("change_this_admin_password")
});

export const env = envSchema.parse({
  API_BASE_URL: process.env.API_BASE_URL,
  ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD
});
