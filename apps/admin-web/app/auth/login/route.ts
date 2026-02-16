import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_VALUE } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPathRaw = String(formData.get("next") ?? "/users");
  const nextPath = nextPathRaw.startsWith("/") ? nextPathRaw : "/users";

  if (password !== env.ADMIN_PASSWORD) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "Password tidak valid");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(ADMIN_SESSION_COOKIE, ADMIN_SESSION_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
  return response;
}
