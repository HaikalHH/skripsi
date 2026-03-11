"use server";

import { revalidatePath } from "next/cache";
import { fetchAdminApi } from "@/lib/api";

export async function deleteUserAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return;
  }

  await fetchAdminApi("/api/admin/users", {
    method: "DELETE",
    body: JSON.stringify({ userId })
  });

  revalidatePath("/users");
}
