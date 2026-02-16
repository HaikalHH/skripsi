import { NextRequest } from "next/server";
import { env } from "./env";

export const isAdminAuthorized = (request: NextRequest): boolean => {
  const token = request.headers.get("x-admin-token");
  return token === env.ADMIN_API_TOKEN;
};
