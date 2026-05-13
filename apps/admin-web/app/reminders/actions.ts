"use server";

import {
  resendFailedOutboundAction as resendFailedOutboundFeatureAction,
  updateReminderTemplateAction as updateReminderTemplateFeatureAction
} from "@/features/reminders/actions";

export async function resendFailedOutboundAction(formData: FormData) {
  return resendFailedOutboundFeatureAction(formData);
}

export async function updateReminderTemplateAction(formData: FormData) {
  return updateReminderTemplateFeatureAction(formData);
}
