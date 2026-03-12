"use client";

import { useFormStatus } from "react-dom";
import { deleteUserAction } from "@/app/users/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="button button-danger button-ghost-danger">
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}

export function DeleteUserForm({ userId }: { userId: string }) {
  return (
    <form
      action={deleteUserAction}
      className="inline-form"
      onSubmit={(event) => {
        const approved = window.confirm(
          "Delete this user and all related records? This action cannot be undone."
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
