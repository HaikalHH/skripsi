"use server";

import {
  deleteUserAction as deleteUserFeatureAction,
  resetOnboardingAction as resetOnboardingFeatureAction
} from "@/features/users/actions";

export async function deleteUserAction(formData: FormData) {
  return deleteUserFeatureAction(formData);
}

export async function resetOnboardingAction(formData: FormData) {
  return resetOnboardingFeatureAction(formData);
}
