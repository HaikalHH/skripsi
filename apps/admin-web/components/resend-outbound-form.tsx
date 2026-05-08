"use client";

import { useFormStatus } from "react-dom";
import { resendFailedOutboundAction } from "@/app/reminders/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="button button-compact">
      {pending ? "Queueing..." : "Resend"}
    </button>
  );
}

export function ResendOutboundForm({
  outboundMessageId
}: {
  outboundMessageId: string;
}) {
  return (
    <form action={resendFailedOutboundAction} className="inline-form">
      <input type="hidden" name="outboundMessageId" value={outboundMessageId} />
      <SubmitButton />
    </form>
  );
}
