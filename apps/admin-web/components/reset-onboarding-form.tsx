"use client";

import { useFormStatus } from "react-dom";
import { resetOnboardingAction } from "@/app/users/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="button button-ghost-warning">
      {pending ? "Resetting..." : "Reset Onboarding"}
    </button>
  );
}

export function ResetOnboardingForm({ userId }: { userId: string }) {
  return (
    <form
      action={resetOnboardingAction}
      className="inline-form"
      onSubmit={(event) => {
        const approved = window.confirm(
          "Reset onboarding for this user? Transactions and messages stay, but onboarding answers will be cleared."
        );

        if (!approved) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton />
    </form>
  );
}
