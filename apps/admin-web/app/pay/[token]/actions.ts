"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";

export async function confirmPaymentAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    return;
  }

  const response = await fetch(`${env.API_BASE_URL}/api/public/payment/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token }),
    cache: "no-store"
  });

  if (!response.ok) {
    redirect(`/pay/${token}?error=1`);
  }

  redirect(`/pay/${token}?paid=1`);
}
