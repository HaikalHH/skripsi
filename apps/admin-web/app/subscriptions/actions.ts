"use server";

import { revalidatePath } from "next/cache";
import { fetchAdminApi } from "@/lib/api";

export async function updateSubscriptionStatusAction(formData: FormData) {
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!subscriptionId || !status) {
    return;
  }

  await fetchAdminApi("/api/admin/subscriptions", {
    method: "PATCH",
    body: JSON.stringify({
      subscriptionId,
      status
    })
  });

  revalidatePath("/subscriptions");
}
