"use server";

import { revalidatePath } from "next/cache";
import { fetchAdminApi } from "@/lib/api";

export async function resendFailedOutboundAction(formData: FormData) {
  const outboundMessageId = String(formData.get("outboundMessageId") ?? "");

  if (!outboundMessageId) {
    return;
  }

  await fetchAdminApi("/api/admin/reminders", {
    method: "PATCH",
    body: JSON.stringify({
      action: "resend-failed-outbound",
      outboundMessageId
    })
  });

  revalidatePath("/reminders");
}

const parseTemplatePayload = (formData: FormData) => {
  const title = String(formData.get("title") ?? "").trim();
  const reminderType = String(formData.get("reminderType") ?? "").trim();
  const messageText = String(formData.get("messageText") ?? "").trim();
  const entities = JSON.parse(String(formData.get("entitiesJson") ?? "[]"));

  if (!title || !reminderType || !messageText) {
    return null;
  }

  return {
    title,
    reminderType,
    messageText,
    entities
  };
};

export async function updateReminderTemplateAction(formData: FormData) {
  const reminderTemplateId = String(formData.get("reminderTemplateId") ?? "");
  const payload = parseTemplatePayload(formData);

  if (!reminderTemplateId || !payload) {
    return;
  }

  await fetchAdminApi("/api/admin/reminders", {
    method: "PATCH",
    body: JSON.stringify({
      action: "update-reminder-template",
      reminderTemplateId,
      ...payload
    })
  });

  revalidatePath("/reminders");
}
